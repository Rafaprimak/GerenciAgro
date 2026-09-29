// GerenciAgro na Cloudflare: Worker que entrega o app (arquivos de public/),
// sincroniza com o banco D1 e, se configurado, lê fotos de laudo com IA.
// Mesmas rotas do servidor Node (server/index.js).
import Anthropic from '@anthropic-ai/sdk';
import { extrairComClaude } from '../server/extract-ai.js';

const COLECOES = ['analises', 'config'];
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function tokenOk(request, env) {
  return !env.SYNC_TOKEN || request.headers.get('X-Sync-Token') === env.SYNC_TOKEN;
}

// Grava as alterações do celular (vence o updatedAt mais recente) e devolve
// o que mudou no servidor desde `since`. Cada gravação recebe um seq novo.
async function sincronizar(db, since, changes) {
  const validas = changes.filter((c) => COLECOES.includes(c.collection) && typeof c.id === 'string' && c.id);
  if (validas.length) {
    const upsert = db.prepare(`
      INSERT INTO records (collection, id, data, updated_at, deleted, seq)
      VALUES (?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(seq), 0) + 1 FROM records))
      ON CONFLICT(collection, id) DO UPDATE SET
        data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted, seq = excluded.seq
      WHERE excluded.updated_at >= records.updated_at`);
    // batch = uma transação só
    await db.batch(validas.map((c) =>
      upsert.bind(c.collection, c.id, JSON.stringify(c.data ?? {}), Number(c.updatedAt) || Date.now(), c.deleted ? 1 : 0)));
  }
  const { results } = await db
    .prepare('SELECT collection, id, data, updated_at, deleted, seq FROM records WHERE seq > ?1 ORDER BY seq LIMIT 5000')
    .bind(Number(since) || 0)
    .all();
  const seq = results.length
    ? results[results.length - 1].seq
    : (await db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM records').first('s'));
  return {
    seq,
    changes: results.map((l) => ({
      collection: l.collection, id: l.id, data: JSON.parse(l.data), updatedAt: l.updated_at, deleted: !!l.deleted,
    })),
  };
}

async function api(request, env, url) {
  if (url.pathname === '/api/health') {
    return json({ ok: true, ai: Boolean(env.ANTHROPIC_API_KEY), token: Boolean(env.SYNC_TOKEN) });
  }
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  if (!tokenOk(request, env)) return json({ error: 'Chave de acesso inválida' }, 401);

  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  if (url.pathname === '/api/sync') {
    const { since = 0, changes = [] } = corpo || {};
    if (!Array.isArray(changes)) return json({ error: 'changes deve ser uma lista' }, 400);
    try {
      return json(await sincronizar(env.DB, since, changes));
    } catch (e) {
      console.error('[sync]', e);
      return json({ error: 'Falha ao gravar no banco' }, 500);
    }
  }

  if (url.pathname === '/api/extract') {
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'Leitura por IA não configurada no servidor' }, 503);
    const { mediaType, data } = corpo || {};
    if (!TIPOS_OK.includes(mediaType) || typeof data !== 'string' || !data) {
      return json({ error: 'Envie mediaType (imagem ou PDF) e data em base64' }, 400);
    }
    try {
      return json(await extrairComClaude({ mediaType, data }, { apiKey: env.ANTHROPIC_API_KEY, modelo: env.CLAUDE_MODEL || undefined }));
    } catch (e) {
      console.error('[extract]', e);
      if (e instanceof Anthropic.RateLimitError) return json({ error: 'Muitas leituras seguidas, tente em instantes' }, 429);
      if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Chave da IA inválida no servidor' }, 503);
      if (e instanceof Anthropic.APIConnectionError) return json({ error: 'Servidor sem conexão com a IA' }, 502);
      if (e instanceof Anthropic.APIError) return json({ error: `Erro da IA (${e.status})` }, 502);
      return json({ error: e.message || 'Falha na leitura' }, 500);
    }
  }

  return json({ error: 'Rota não encontrada' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env, url);
    // demais caminhos: arquivos do app (public/)
    return env.ASSETS.fetch(request);
  },
};
