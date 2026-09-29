// Servidor do GerenciAgro: entrega o app (PWA), recebe a sincronização dos celulares
// e, se configurado, lê fotos de laudo com IA.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { abrirBanco } from './db.js';
import { extrairComClaude } from './extract-ai.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.env.PORT) || 3000;
const TOKEN = process.env.SYNC_TOKEN || '';
const COLECOES = ['analises', 'config'];
const CHAVE_IA = process.env.ANTHROPIC_API_KEY || '';
const iaConfigurada = () => Boolean(CHAVE_IA);

const db = abrirBanco(process.env.DB_FILE || path.join(raiz, 'data', 'gerenciagro.db'));
const app = express();
app.disable('x-powered-by');

function exigirToken(req, res, next) {
  if (TOKEN && req.get('X-Sync-Token') !== TOKEN) return res.status(401).json({ error: 'Chave de acesso inválida' });
  next();
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ai: iaConfigurada(), token: Boolean(TOKEN) });
});

app.post('/api/sync', exigirToken, express.json({ limit: '10mb' }), (req, res) => {
  const { since = 0, changes = [] } = req.body || {};
  if (!Array.isArray(changes)) return res.status(400).json({ error: 'changes deve ser uma lista' });
  try {
    res.json(db.sincronizar(since, changes, COLECOES));
  } catch (e) {
    console.error('[sync]', e);
    res.status(500).json({ error: 'Falha ao gravar no banco' });
  }
});

const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
app.post('/api/extract', exigirToken, express.json({ limit: '25mb' }), async (req, res) => {
  if (!iaConfigurada()) return res.status(503).json({ error: 'Leitura por IA não configurada no servidor' });
  const { mediaType, data } = req.body || {};
  if (!TIPOS_OK.includes(mediaType) || typeof data !== 'string' || !data) {
    return res.status(400).json({ error: 'Envie mediaType (imagem ou PDF) e data em base64' });
  }
  try {
    res.json(await extrairComClaude({ mediaType, data }, { apiKey: CHAVE_IA, modelo: process.env.CLAUDE_MODEL || undefined }));
  } catch (e) {
    console.error('[extract]', e);
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Muitas leituras seguidas, tente em instantes' });
    if (e instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: 'Chave da IA inválida no servidor' });
    if (e instanceof Anthropic.APIConnectionError) return res.status(502).json({ error: 'Servidor sem conexão com a IA' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ error: `Erro da IA (${e.status})` });
    res.status(500).json({ error: e.message || 'Falha na leitura' });
  }
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
  console.log(`Leitura por IA: ${iaConfigurada() ? 'ativa' : 'desativada (defina ANTHROPIC_API_KEY para ativar)'}`);
  console.log(`Chave de sincronização: ${TOKEN ? 'exigida' : 'não exigida (defina SYNC_TOKEN para proteger)'}`);
});
