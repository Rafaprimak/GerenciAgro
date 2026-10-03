// Banco local (IndexedDB). Tudo funciona offline; registros alterados ficam marcados
// com _dirty = 1 até o sync enviar para o servidor.
// Cada usuário tem o próprio banco no aparelho (gerenciagro-<id do usuário>).

const LEGADO = 'gerenciagro'; // banco de antes das contas (um só para todos)
const DB_VERSION = 1;
export const COLECOES = ['analises', 'config'];

let dbNome = null;
let dbPromise;
export const eventos = new EventTarget();

// Escolhe o banco do usuário conectado. Precisa ser chamado antes de qualquer leitura.
export function usarUsuario(userId) {
  dbNome = `${LEGADO}-${userId}`;
  dbPromise = null;
}

function abrir() {
  if (!dbNome) return Promise.reject(new Error('Nenhum usuário conectado'));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbNome, DB_VERSION);
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

export async function restaurar(colecao, id) {
  const r = await obter(colecao, id);
  if (!r) return;
  return salvar(colecao, { ...r, deleted: false });
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

// Apaga o banco do usuário conectado deste aparelho (ao sair da conta)
export async function limparTudo() {
  const db = await abrir();
  db.close();
  dbPromise = null;
  await req2p(indexedDB.deleteDatabase(dbNome));
}

// ---------- dados de antes das contas ----------

// Lê o banco antigo, se existir neste aparelho: { analises, config } ou null
export async function dadosLegados() {
  if (indexedDB.databases && !(await indexedDB.databases()).some((d) => d.name === LEGADO)) return null;
  const db = await new Promise((resolve) => {
    const req = indexedDB.open(LEGADO);
    // não existia: cancela para não criar um banco vazio
    req.onupgradeneeded = () => req.transaction.abort();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  if (!db) return null;
  try {
    if (!COLECOES.every((c) => db.objectStoreNames.contains(c))) return null;
    const ler = (c) => new Promise((res, rej) => {
      const r = db.transaction(c).objectStore(c).getAll();
      r.onsuccess = () => res(r.result.filter((x) => !x.deleted));
      r.onerror = () => rej(r.error);
    });
    const dados = { analises: await ler('analises'), config: await ler('config') };
    return dados.analises.length || dados.config.length ? dados : null;
  } finally {
    db.close();
  }
}

// Copia os dados antigos para o banco do usuário (marcados para enviar à conta dele)
export async function importarLegado({ analises, config }) {
  for (const r of [...analises.map((a) => ['analises', a]), ...config.map((c) => ['config', c])]) {
    const { _dirty, ...dados } = r[1];
    await salvar(r[0], dados);
  }
}

export async function apagarLegado() {
  await req2p(indexedDB.deleteDatabase(LEGADO));
}
