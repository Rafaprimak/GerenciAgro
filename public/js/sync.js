// Sincronização com o servidor.
// - Envia registros alterados offline (_dirty) e recebe o que mudou no servidor desde o último sync.
// - Conflito: vence a alteração mais recente (updatedAt).
// - Roda ao voltar a internet, a cada minuto e alguns segundos após cada alteração local.

import * as store from './store.js';

export const estado = new EventTarget();
export const CHAVE_INVALIDA = 'Chave de acesso ausente ou inválida. Informe em Ajustes.';
let rodando = false;
let ultimoErro = null;
let timer = null;

function emitir() {
  estado.dispatchEvent(new Event('mudou'));
}

export async function servidorBase() {
  const url = (await store.getMeta('serverUrl', '')) || '';
  return url.replace(/\/+$/, '');
}

async function cabecalhos() {
  const h = { 'Content-Type': 'application/json' };
  const token = await store.getMeta('syncToken', '');
  if (token) h['X-Sync-Token'] = token;
  return h;
}

export async function info() {
  return {
    online: navigator.onLine,
    rodando,
    ultimoErro,
    pendentes: (await store.pendentes()).length,
    ultimoSync: await store.getMeta('ultimoSync', null),
  };
}

export async function sincronizar() {
  if (rodando || !navigator.onLine) return;
  rodando = true;
  emitir();
  try {
    const since = await store.getMeta('syncSeq', 0);
    const pend = await store.pendentes();
    const changes = pend.map(({ colecao, registro }) => {
      const { _dirty, ...dados } = registro;
      return { collection: colecao, id: registro.id, updatedAt: registro.updatedAt, deleted: !!registro.deleted, data: dados };
    });
    const resp = await fetch(`${await servidorBase()}/api/sync`, {
      method: 'POST',
      headers: await cabecalhos(),
      body: JSON.stringify({ since, changes }),
    });
    if (!resp.ok) throw new Error(resp.status === 401 ? CHAVE_INVALIDA : `Servidor respondeu ${resp.status}`);
    const r = await resp.json();
    for (const c of changes) await store.marcarLimpo(c.collection, c.id, c.updatedAt);
    let recebidos = 0;
    for (const rec of r.changes || []) {
      if (!store.COLECOES.includes(rec.collection)) continue;
      const local = await store.obter(rec.collection, rec.id);
      const remoto = { ...rec.data, id: rec.id, updatedAt: rec.updatedAt, deleted: !!rec.deleted };
      if (!local || rec.updatedAt > local.updatedAt) {
        if (!local || local.updatedAt !== rec.updatedAt) recebidos++;
        await store.gravarDoServidor(rec.collection, remoto);
      }
    }
    await store.setMeta('syncSeq', r.seq ?? since);
    await store.setMeta('ultimoSync', Date.now());
    ultimoErro = null;
    if (recebidos) store.eventos.dispatchEvent(new CustomEvent('mudou', { detail: { remoto: true } }));
  } catch (e) {
    ultimoErro = e.message || String(e);
  } finally {
    rodando = false;
    emitir();
  }
}

export function iniciar() {
  window.addEventListener('online', () => { emitir(); sincronizar(); });
  window.addEventListener('offline', emitir);
  store.eventos.addEventListener('mudou', (e) => {
    if (!e.detail?.local) return;
    emitir();
    clearTimeout(timer);
    timer = setTimeout(sincronizar, 3000);
  });
  setInterval(sincronizar, 60000);
  sincronizar();
}
