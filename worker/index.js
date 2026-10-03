// GerenciAgro na Cloudflare: Worker que entrega o app (arquivos de public/) e responde
// as rotas /api/* (contas, sincronização com o banco D1 e leitura de fotos por IA).
// As rotas são as mesmas do servidor Node: ficam em server/api.js.
import { tratarApi } from '../server/api.js';

// Banco D1 com a mesma interface do SQLite do servidor Node (server/db.js)
function adaptarD1(d1) {
  const st = (sql, p) => d1.prepare(sql).bind(...p);
  return {
    async first(sql, ...p) { return (await st(sql, p).first()) ?? null; },
    async all(sql, ...p) { return (await st(sql, p).all()).results; },
    async run(sql, ...p) { await st(sql, p).run(); },
    async batch(comandos) { if (comandos.length) await d1.batch(comandos.map(([sql, p = []]) => st(sql, p))); },
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return tratarApi(request, {
        db: adaptarD1(env.DB),
        env,
        ip: request.headers.get('CF-Connecting-IP') || '?',
        aoFundo: (p) => ctx.waitUntil(p.catch((e) => console.error('[fundo]', e))),
      });
    }
    // demais caminhos: arquivos do app (public/)
    return env.ASSETS.fetch(request);
  },
};
