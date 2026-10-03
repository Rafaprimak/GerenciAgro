// Servidor local do GerenciAgro: entrega o app (PWA) e responde as rotas /api/*
// (contas, sincronização e leitura de fotos por IA), as mesmas do Cloudflare Worker.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { abrirSqlite } from './db.js';
import { tratarApi } from './api.js';
import { novaChaveMestra } from './seguranca.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.env.PORT) || 3000;
const pastaDados = path.join(raiz, 'data');

// Chave que cifra os dados no banco. Sem DATA_KEY definida, cria uma em data/chave-dados
// (fora do git). Perder essa chave = perder os dados do servidor.
function chaveDados() {
  if (process.env.DATA_KEY) return process.env.DATA_KEY;
  const arq = path.join(pastaDados, 'chave-dados');
  if (!fs.existsSync(arq)) {
    fs.mkdirSync(pastaDados, { recursive: true });
    fs.writeFileSync(arq, novaChaveMestra(), { mode: 0o600 });
    console.log(`Chave de cifra dos dados criada em ${arq}. Guarde uma cópia em local seguro.`);
  }
  return fs.readFileSync(arq, 'utf8').trim();
}

const env = {
  ...process.env,
  DATA_KEY: chaveDados(),
  APP_URL: process.env.APP_URL || `http://localhost:${PORTA}`,
};
const db = abrirSqlite(process.env.DB_FILE || path.join(pastaDados, 'gerenciagro.db'));
const app = express();
app.disable('x-powered-by');

// Converte a requisição do Express para o formato web (Request) e devolve a Response
app.use('/api', async (req, res) => {
  const temCorpo = !['GET', 'HEAD'].includes(req.method);
  const request = new Request(`${req.protocol}://${req.get('host')}${req.originalUrl}`, {
    method: req.method,
    headers: new Headers(Object.entries(req.headers).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]))),
    body: temCorpo ? Readable.toWeb(req) : undefined,
    duplex: temCorpo ? 'half' : undefined,
  });
  const resp = await tratarApi(request, {
    db,
    env,
    ip: req.ip,
    aoFundo: (p) => p.catch((e) => console.error('[fundo]', e)),
  });
  res.status(resp.status);
  resp.headers.forEach((v, k) => { if (k !== 'set-cookie') res.setHeader(k, v); });
  const cookies = resp.headers.getSetCookie();
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.end(Buffer.from(await resp.arrayBuffer()));
});

// App estático. sw.js e index.html sem cache HTTP para as atualizações chegarem.
app.use(express.static(path.join(raiz, 'public'), {
  setHeaders(res, arquivo) {
    if (/sw\.js$|index\.html$|\.webmanifest$/.test(arquivo)) res.setHeader('Cache-Control', 'no-cache');
    if (arquivo.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json');
  },
}));

app.listen(PORTA, () => {
  console.log(`GerenciAgro rodando em http://localhost:${PORTA}`);
  console.log(`Leitura por IA: ${env.ANTHROPIC_API_KEY ? 'ativa' : 'desativada (defina ANTHROPIC_API_KEY para ativar)'}`);
  console.log(`E-mail de recuperação de senha: ${env.RESEND_API_KEY ? 'ativo' : 'desativado (o link aparece aqui no console; defina RESEND_API_KEY para enviar)'}`);
});
