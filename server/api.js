// Rotas /api/* do GerenciAgro, no formato Request -> Response (padrão web).
// Usadas pelo Cloudflare Worker (worker/index.js) e pelo servidor Node (server/index.js).
//
// Contas: cadastro, entrar, sair, esqueci a senha, redefinir e trocar a senha.
// A sessão fica num cookie HttpOnly (o JavaScript da página não consegue ler o token).
// Cada usuário só lê e grava os próprios registros, cifrados com a chave dele.
//
// ctx = { db, env, ip, aoFundo(promise), enviarEmail?(env, msg) }
//   env: DATA_KEY (obrigatória), ANTHROPIC_API_KEY, CLAUDE_MODEL, RESEND_API_KEY, EMAIL_FROM, APP_URL
import Anthropic from '@anthropic-ai/sdk';
import { extrairComClaude } from './extract-ai.js';
import { criarCifra, hashSenha, conferirSenha, novoToken, sha256 } from './seguranca.js';

const COLECOES = ['analises', 'config', 'planejamentos'];
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const COOKIE = 'ga_sessao';
const MIN = 60 * 1000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const DURACAO_SESSAO = 60 * DIA;
const DURACAO_LINK_SENHA = 30 * MIN;
const MAX_CORPO = 25 * 1024 * 1024;

class ErroHttp extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}

const json = (dados, status = 200, cabecalhos = {}) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cabecalhos },
  });

// ---------- validação ----------

const emailOk = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const normEmail = (v) => String(v ?? '').trim().toLowerCase();
// O aparelho envia a senha já esticada: base64 de 32 bytes (ver public/js/auth.js)
const senhaOk = (v) => typeof v === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(v);

// ---------- cookie de sessão ----------

function lerCookie(request, nome) {
  for (const parte of (request.headers.get('Cookie') || '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return v.join('=');
  }
  return null;
}

function cookieSessao(url, token, maxAgeSeg) {
  const seguro = url.protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeg}${seguro}`;
}

async function criarSessao(db, userId, url) {
  const token = novoToken();
  const agora = Date.now();
  await db.run('INSERT INTO sessions (token_hash, user_id, criado_em, expira_em) VALUES (?, ?, ?, ?)',
    await sha256(token), userId, agora, agora + DURACAO_SESSAO);
  return cookieSessao(url, token, DURACAO_SESSAO / 1000);
}

async function sessaoAtual(db, request) {
  const token = lerCookie(request, COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const s = await db.first(`
    SELECT s.token_hash, s.expira_em, u.id, u.email, u.nome FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expira_em > ?`, tokenHash, Date.now());
  return s;
}

async function exigirSessao(db, request) {
  const s = await sessaoAtual(db, request);
  if (!s) throw new ErroHttp(401, 'Sessão expirada. Entre novamente.');
  return s;
}

const publico = (u) => ({ id: u.id, email: u.email, nome: u.nome });

// ---------- limite de tentativas ----------

async function excedeu(db, chave, max, janela) {
  const r = await db.first('SELECT COUNT(*) AS n FROM attempts WHERE chave = ? AND em > ?', chave, Date.now() - janela);
  return r.n >= max;
}
const anotar = (db, chave) => db.run('INSERT INTO attempts (chave, em) VALUES (?, ?)', chave, Date.now());

async function faxina(db) {
  const agora = Date.now();
  await db.batch([
    ['DELETE FROM attempts WHERE em < ?', [agora - DIA]],
    ['DELETE FROM sessions WHERE expira_em < ?', [agora]],
    ['DELETE FROM password_resets WHERE expira_em < ?', [agora]],
  ]);
}

const MUITAS = 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';

// ---------- e-mail ----------

async function enviarEmailPadrao(env, { para, assunto, texto, html }) {
  if (!env.RESEND_API_KEY) {
    console.log(`[email] RESEND_API_KEY não configurada; mensagem não enviada.\nPara: ${para}\nAssunto: ${assunto}\n${texto}`);
    return;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM || 'GerenciAgro <onboarding@resend.dev>', to: [para], subject: assunto, text: texto, html }),
  });
  if (!r.ok) throw new Error(`Resend respondeu ${r.status}: ${await r.text()}`);
}

function emailRedefinir(nome, link) {
  const texto = `Olá, ${nome}.\n\nPara criar uma nova senha no GerenciAgro, abra o link abaixo (vale por 30 minutos):\n${link}\n\nSe não foi você que pediu, ignore este e-mail: sua senha continua a mesma.`;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<p>Olá, ${esc(nome)}.</p><p>Para criar uma nova senha no GerenciAgro, toque no botão abaixo. O link vale por 30 minutos.</p>
<p><a href="${esc(link)}" style="display:inline-block;padding:12px 20px;background:#177245;color:#fff;border-radius:10px;text-decoration:none;font-weight:600">Criar nova senha</a></p>
<p style="color:#6b766f;font-size:13px">Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.</p>`;
  return { assunto: 'Redefinir sua senha do GerenciAgro', texto, html };
}

// ---------- rotas de conta ----------

async function cadastro(corpo, ctx, url) {
  const { db } = ctx;
  const nome = String(corpo.nome ?? '').trim();
  const email = normEmail(corpo.email);
  if (!nome || nome.length > 80) throw new ErroHttp(400, 'Informe seu nome');
  if (!emailOk(email)) throw new ErroHttp(400, 'E-mail inválido');
  if (!senhaOk(corpo.senha)) throw new ErroHttp(400, 'Senha inválida');
  if (await excedeu(db, `cadastro:${ctx.ip}`, 10, HORA)) throw new ErroHttp(429, MUITAS);
  await anotar(db, `cadastro:${ctx.ip}`);
  await faxina(db);
  if (await db.first('SELECT 1 FROM users WHERE email = ?', email)) throw new ErroHttp(409, 'Este e-mail já tem conta. Use "Entrar" ou "Esqueci a senha".');

  const usuario = { id: crypto.randomUUID(), email, nome };
  await db.run('INSERT INTO users (id, email, nome, senha_hash, criado_em) VALUES (?, ?, ?, ?, ?)',
    usuario.id, email, nome, await hashSenha(corpo.senha), Date.now());
  return json({ usuario }, 201, { 'Set-Cookie': await criarSessao(db, usuario.id, url) });
}

async function entrar(corpo, ctx, url) {
  const { db } = ctx;
  const email = normEmail(corpo.email);
  if (!emailOk(email) || !senhaOk(corpo.senha)) throw new ErroHttp(400, 'Informe e-mail e senha');
  if (await excedeu(db, `entrar:${email}`, 10, 15 * MIN) || await excedeu(db, `entrar-ip:${ctx.ip}`, 30, 15 * MIN)) {
    throw new ErroHttp(429, MUITAS);
  }
  await faxina(db);
  const u = await db.first('SELECT id, email, nome, senha_hash FROM users WHERE email = ?', email);
  const ok = await conferirSenha(corpo.senha, u?.senha_hash); // sem usuário: confere com hash falso (mesmo tempo)
  if (!u || !ok) {
    await db.batch([
      ['INSERT INTO attempts (chave, em) VALUES (?, ?)', [`entrar:${email}`, Date.now()]],
      ['INSERT INTO attempts (chave, em) VALUES (?, ?)', [`entrar-ip:${ctx.ip}`, Date.now()]],
    ]);
    throw new ErroHttp(401, 'E-mail ou senha incorretos');
  }
  return json({ usuario: publico(u) }, 200, { 'Set-Cookie': await criarSessao(db, u.id, url) });
}

async function sair(request, ctx, url) {
  const token = lerCookie(request, COOKIE);
  if (token) await ctx.db.run('DELETE FROM sessions WHERE token_hash = ?', await sha256(token));
  return json({ ok: true }, 200, { 'Set-Cookie': cookieSessao(url, '', 0) });
}

// Confere a sessão e renova se estiver na metade final da validade
async function eu(request, ctx, url) {
  const s = await exigirSessao(ctx.db, request);
  const cab = {};
  if (s.expira_em - Date.now() < DURACAO_SESSAO / 2) {
    await ctx.db.run('UPDATE sessions SET expira_em = ? WHERE token_hash = ?', Date.now() + DURACAO_SESSAO, s.token_hash);
    cab['Set-Cookie'] = cookieSessao(url, lerCookie(request, COOKIE), DURACAO_SESSAO / 1000);
  }
  return json({ usuario: publico(s) }, 200, cab);
}

// Responde sempre igual, exista ou não a conta (não revela quais e-mails estão cadastrados)
async function esqueci(corpo, ctx, url) {
  const { db, env } = ctx;
  const email = normEmail(corpo.email);
  if (!emailOk(email)) throw new ErroHttp(400, 'E-mail inválido');
  if (await excedeu(db, `esqueci-ip:${ctx.ip}`, 10, HORA)) throw new ErroHttp(429, MUITAS);
  await anotar(db, `esqueci-ip:${ctx.ip}`);

  // O trabalho segue em segundo plano para o tempo de resposta não revelar se o e-mail existe
  ctx.aoFundo((async () => {
    if (await excedeu(db, `esqueci:${email}`, 3, HORA)) return;
    await anotar(db, `esqueci:${email}`);
    const u = await db.first('SELECT id, nome FROM users WHERE email = ?', email);
    if (!u) return;
    const token = novoToken();
    await db.batch([
      ['DELETE FROM password_resets WHERE user_id = ?', [u.id]],
      ['INSERT INTO password_resets (token_hash, user_id, expira_em) VALUES (?, ?, ?)', [await sha256(token), u.id, Date.now() + DURACAO_LINK_SENHA]],
    ]);
    const base = (env.APP_URL || url.origin).replace(/\/+$/, '');
    // token no "#": não vai para logs de servidor nem no Referer
    const msg = emailRedefinir(u.nome, `${base}/#/redefinir/${token}`);
    await (ctx.enviarEmail || enviarEmailPadrao)(env, { para: email, ...msg });
  })());
  return json({ ok: true });
}

async function buscarLinkSenha(db, token) {
  if (typeof token !== 'string' || !token || token.length > 100) return null;
  return db.first(`
    SELECT r.token_hash, u.id, u.email, u.nome FROM password_resets r JOIN users u ON u.id = r.user_id
    WHERE r.token_hash = ? AND r.expira_em > ?`, await sha256(token), Date.now());
}
const LINK_INVALIDO = 'Este link expirou ou já foi usado. Peça um novo em "Esqueci a senha".';

async function verificarLink(corpo, ctx) {
  const r = await buscarLinkSenha(ctx.db, corpo.token);
  if (!r) throw new ErroHttp(400, LINK_INVALIDO);
  return json({ email: r.email });
}

// Troca a senha, encerra todas as sessões (inclusive em outros aparelhos) e já entra
async function redefinir(corpo, ctx, url) {
  const { db } = ctx;
  if (!senhaOk(corpo.senha)) throw new ErroHttp(400, 'Senha inválida');
  const r = await buscarLinkSenha(db, corpo.token);
  if (!r) throw new ErroHttp(400, LINK_INVALIDO);
  await db.batch([
    ['UPDATE users SET senha_hash = ? WHERE id = ?', [await hashSenha(corpo.senha), r.id]],
    ['DELETE FROM password_resets WHERE user_id = ?', [r.id]],
    ['DELETE FROM sessions WHERE user_id = ?', [r.id]],
  ]);
  return json({ usuario: publico(r) }, 200, { 'Set-Cookie': await criarSessao(db, r.id, url) });
}

// Troca de senha logado: confere a atual e encerra as outras sessões
async function trocarSenha(request, corpo, ctx) {
  const { db } = ctx;
  const s = await exigirSessao(db, request);
  if (!senhaOk(corpo.atual) || !senhaOk(corpo.nova)) throw new ErroHttp(400, 'Senha inválida');
  if (await excedeu(db, `entrar:${s.email}`, 10, 15 * MIN)) throw new ErroHttp(429, MUITAS);
  const u = await db.first('SELECT senha_hash FROM users WHERE id = ?', s.id);
  if (!(await conferirSenha(corpo.atual, u.senha_hash))) {
    await anotar(db, `entrar:${s.email}`);
    throw new ErroHttp(400, 'Senha atual incorreta');
  }
  await db.batch([
    ['UPDATE users SET senha_hash = ? WHERE id = ?', [await hashSenha(corpo.nova), s.id]],
    ['DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', [s.id, s.token_hash]],
  ]);
  return json({ ok: true });
}

// ---------- sincronização ----------

// Grava as alterações do aparelho (vence o updatedAt mais recente) e devolve o que mudou
// no servidor desde `since`, só do próprio usuário. Cada gravação recebe um seq novo.
async function sincronizar(request, corpo, ctx) {
  const { db } = ctx;
  const { id: userId } = await exigirSessao(db, request);
  const { since = 0, changes = [] } = corpo;
  if (!Array.isArray(changes)) throw new ErroHttp(400, 'changes deve ser uma lista');
  const cifra = await criarCifra(ctx.env.DATA_KEY);

  const validas = changes.filter((c) => COLECOES.includes(c?.collection) && typeof c.id === 'string' && c.id && c.id.length <= 100);
  const upsert = `
    INSERT INTO records (user_id, collection, id, data, updated_at, deleted, seq)
    VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM records))
    ON CONFLICT(user_id, collection, id) DO UPDATE SET
      data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, seq = excluded.seq
    WHERE excluded.updated_at >= records.updated_at`;
  await db.batch(await Promise.all(validas.map(async (c) => [upsert, [
    userId, c.collection, c.id,
    // excluído: guarda só a marca (os outros aparelhos precisam saber que sumiu), sem o conteúdo
    await cifra.cifrar(userId, c.collection, c.id, c.deleted ? {} : c.data ?? {}),
    Number(c.updatedAt) || Date.now(), c.deleted ? 1 : 0,
  ]])));

  const linhas = await db.all(
    'SELECT collection, id, data, updated_at, deleted, seq FROM records WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT 5000',
    userId, Number(since) || 0);
  const seq = linhas.length
    ? linhas[linhas.length - 1].seq
    : (await db.first('SELECT COALESCE(MAX(seq), 0) AS s FROM records WHERE user_id = ?', userId)).s;
  return json({
    seq,
    changes: await Promise.all(linhas.map(async (l) => ({
      collection: l.collection, id: l.id, updatedAt: l.updated_at, deleted: !!l.deleted,
      data: await cifra.decifrar(userId, l.collection, l.id, l.data),
    }))),
  });
}

// ---------- leitura de laudo por IA ----------

async function extrair(request, corpo, ctx) {
  const { db, env } = ctx;
  const s = await exigirSessao(db, request);
  if (!env.ANTHROPIC_API_KEY) throw new ErroHttp(503, 'Leitura por IA não configurada no servidor');
  const { mediaType, data } = corpo;
  if (!TIPOS_OK.includes(mediaType) || typeof data !== 'string' || !data) {
    throw new ErroHttp(400, 'Envie mediaType (imagem ou PDF) e data em base64');
  }
  // protege o uso (e o custo) da chave da IA
  if (await excedeu(db, `ia:${s.id}`, 60, HORA)) throw new ErroHttp(429, 'Limite de leituras por IA atingido. Tente daqui a pouco.');
  await anotar(db, `ia:${s.id}`);
  try {
    return json(await extrairComClaude({ mediaType, data }, { apiKey: env.ANTHROPIC_API_KEY, modelo: env.CLAUDE_MODEL || undefined }));
  } catch (e) {
    console.error('[extract]', e);
    if (e instanceof Anthropic.RateLimitError) throw new ErroHttp(429, 'Muitas leituras seguidas, tente em instantes');
    if (e instanceof Anthropic.AuthenticationError) throw new ErroHttp(503, 'Chave da IA inválida no servidor');
    if (e instanceof Anthropic.APIConnectionError) throw new ErroHttp(502, 'Servidor sem conexão com a IA');
    if (e instanceof Anthropic.APIError) throw new ErroHttp(502, `Erro da IA (${e.status})`);
    throw new ErroHttp(500, 'Falha na leitura');
  }
}

// ---------- roteador ----------

const ROTAS_POST = {
  '/api/auth/cadastro': (req, corpo, ctx, url) => cadastro(corpo, ctx, url),
  '/api/auth/entrar': (req, corpo, ctx, url) => entrar(corpo, ctx, url),
  '/api/auth/sair': (req, corpo, ctx, url) => sair(req, ctx, url),
  '/api/auth/esqueci': (req, corpo, ctx, url) => esqueci(corpo, ctx, url),
  '/api/auth/redefinir/verificar': (req, corpo, ctx) => verificarLink(corpo, ctx),
  '/api/auth/redefinir': (req, corpo, ctx, url) => redefinir(corpo, ctx, url),
  '/api/auth/senha': (req, corpo, ctx) => trocarSenha(req, corpo, ctx),
  '/api/sync': (req, corpo, ctx) => sincronizar(req, corpo, ctx),
  '/api/extract': (req, corpo, ctx) => extrair(req, corpo, ctx),
};

export async function tratarApi(request, ctx) {
  const url = new URL(request.url);
  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json({ ok: true, ai: Boolean(ctx.env.ANTHROPIC_API_KEY) });
    }
    if (request.method === 'GET' && url.pathname === '/api/auth/eu') return await eu(request, ctx, url);

    const rota = ROTAS_POST[url.pathname];
    if (!rota) return json({ error: 'Rota não encontrada' }, 404);
    if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

    // Contra CSRF: só aceita JSON (outro site não consegue enviar sem permissão do navegador)
    // e, se o navegador informar a origem, ela precisa ser este próprio app.
    const origem = request.headers.get('Origin');
    if (origem && origem !== url.origin) return json({ error: 'Origem não permitida' }, 403);
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) {
      return json({ error: 'Envie JSON' }, 415);
    }
    if (Number(request.headers.get('Content-Length')) > MAX_CORPO) return json({ error: 'Arquivo grande demais' }, 413);

    let corpo;
    try {
      corpo = (await request.json()) || {};
    } catch {
      return json({ error: 'JSON inválido' }, 400);
    }
    if (typeof corpo !== 'object') return json({ error: 'JSON inválido' }, 400);
    return await rota(request, corpo, ctx, url);
  } catch (e) {
    if (e instanceof ErroHttp) return json({ error: e.message }, e.status);
    console.error(`[api] ${url.pathname}`, e);
    return json({ error: 'Erro no servidor' }, 500);
  }
}
