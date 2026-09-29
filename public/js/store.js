// Banco local (IndexedDB). Tudo funciona offline; registros alterados ficam marcados
// com _dirty = 1 até o sync enviar para o servidor.

const DB_NAME = 'gerenciagro';
const DB_VERSION = 1;
export const COLECOES = ['analises', 'config'];

let dbPromise;
export const eventos = new EventTarget();

function abrir() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const c of COLECOES) if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, modo, fn) {
  const db = await abrir();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, modo);
    const s = t.objectStore(store);
    let resultado;
    Promise.resolve(fn(s)).then((r) => (resultado = r));
    t.oncomplete = () => resolve(resultado);
    t.onerror = () => reject(t.error);
  });
}

const req2p = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function todos(colecao, { incluirExcluidos = false } = {}) {
  const lista = await tx(colecao, 'readonly', (s) => req2p(s.getAll()));
  return incluirExcluidos ? lista : lista.filter((r) => !r.deleted);
}

export async function obter(colecao, id) {
  return tx(colecao, 'readonly', (s) => req2p(s.get(id)));
}

// Salva alteração local (marca para sincronizar)
export async function salvar(colecao, registro) {
  const r = { ...registro, updatedAt: Date.now(), _dirty: 1 };
  await tx(colecao, 'readwrite', (s) => req2p(s.put(r)));
  eventos.dispatchEvent(new CustomEvent('mudou', { detail: { colecao, id: r.id, local: true } }));
  return r;
}

export async function excluir(colecao, id) {
  const r = await obter(colecao, id);
  if (!r) return;
  return salvar(colecao, { ...r, deleted: true });
}

// Grava registro vindo do servidor (não marca como sujo)
export async function gravarDoServidor(colecao, registro) {
  await tx(colecao, 'readwrite', (s) => req2p(s.put({ ...registro, _dirty: 0 })));
}

export async function marcarLimpo(colecao, id, updatedAtEnviado) {
  await tx(colecao, 'readwrite', async (s) => {
    const r = await req2p(s.get(id));
    if (r && r.updatedAt === updatedAtEnviado) {
      r._dirty = 0;
      await req2p(s.put(r));
    }
  });
}

export async function pendentes() {
  const out = [];
  for (const c of COLECOES) {
    const lista = await todos(c, { incluirExcluidos: true });
    for (const r of lista) if (r._dirty) out.push({ colecao: c, registro: r });
  }
  return out;
}

export async function getMeta(k, padrao = null) {
  const r = await tx('meta', 'readonly', (s) => req2p(s.get(k)));
  return r ? r.v : padrao;
}

export async function setMeta(k, v) {
  await tx('meta', 'readwrite', (s) => req2p(s.put({ k, v })));
}

export async function limparTudo() {
  const db = await abrir();
  db.close();
  dbPromise = null;
  await req2p(indexedDB.deleteDatabase(DB_NAME));
}
