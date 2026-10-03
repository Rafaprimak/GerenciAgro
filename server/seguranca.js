// Criptografia do servidor (Web Crypto: funciona igual no Node e no Cloudflare Worker).
// - Senha: o aparelho já envia a senha esticada (PBKDF2 600 mil rodadas, ver public/js/auth.js);
//   aqui ela passa por mais um PBKDF2 com sal aleatório antes de ir para o banco.
// - Tokens (sessão e "esqueci a senha"): aleatórios de 256 bits; o banco guarda só o SHA-256.
// - Dados: AES-256-GCM com uma chave por usuário, derivada (HKDF) da chave mestra DATA_KEY.
import { Buffer } from 'node:buffer';

const { subtle } = globalThis.crypto;
const enc = new TextEncoder();
const ITERACOES_SERVIDOR = 5000;

export const b64 = (bytes) => Buffer.from(bytes).toString('base64');
export const deB64 = (txt) => new Uint8Array(Buffer.from(txt, 'base64'));
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

export function aleatorio(n = 32) {
  return crypto.getRandomValues(new Uint8Array(n));
}

export const novoToken = () => b64url(aleatorio(32));

export async function sha256(txt) {
  return b64(new Uint8Array(await subtle.digest('SHA-256', enc.encode(txt))));
}

// Compara sem vazar pelo tempo de resposta quantos caracteres batem
export function iguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

async function pbkdf2(segredo, sal, iteracoes) {
  const chave = await subtle.importKey('raw', enc.encode(segredo), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, chave, 256));
}

export async function hashSenha(senhaDoAparelho) {
  const sal = aleatorio(16);
  return `pbkdf2-sha256$${ITERACOES_SERVIDOR}$${b64(sal)}$${b64(await pbkdf2(senhaDoAparelho, sal, ITERACOES_SERVIDOR))}`;
}

// Usado quando o e-mail não existe, para o tempo de resposta ser o mesmo
const HASH_FALSO = `pbkdf2-sha256$${ITERACOES_SERVIDOR}$${b64(new Uint8Array(16))}$${b64(new Uint8Array(32))}`;

export async function conferirSenha(senhaDoAparelho, guardado = HASH_FALSO) {
  const [alg, iter, sal, hash] = guardado.split('$');
  if (alg !== 'pbkdf2-sha256') return false;
  return iguais(b64(await pbkdf2(senhaDoAparelho, deB64(sal), Number(iter))), hash);
}

// ---------- dados cifrados ----------

// Gera uma chave mestra nova (para DATA_KEY)
export const novaChaveMestra = () => b64(aleatorio(32));

// Cria o cifrador a partir da DATA_KEY (base64 de 32 bytes). Chaves por usuário ficam em cache.
export async function criarCifra(chaveMestraB64) {
  const bruta = deB64(chaveMestraB64 || '');
  if (bruta.length !== 32) throw new Error('DATA_KEY ausente ou inválida (precisa ser base64 de 32 bytes)');
  const mestra = await subtle.importKey('raw', bruta, 'HKDF', false, ['deriveKey']);
  const cache = new Map();
  const chaveDo = (userId) => {
    if (!cache.has(userId)) {
      cache.set(userId, subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(`gerenciagro:${userId}`), info: enc.encode('dados-v1') },
        mestra, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
    }
    return cache.get(userId);
  };
  // O "contexto" (usuário, coleção, id) entra como dado autenticado: um registro copiado
  // para outro usuário ou outro id não decifra.
  const contexto = (userId, colecao, id) => enc.encode(`${userId}\n${colecao}\n${id}`);

  return {
    async cifrar(userId, colecao, id, objeto) {
      const iv = aleatorio(12);
      const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: contexto(userId, colecao, id) },
        await chaveDo(userId), enc.encode(JSON.stringify(objeto)));
      return `v1.${b64(iv)}.${b64(new Uint8Array(ct))}`;
    },
    async decifrar(userId, colecao, id, texto) {
      if (!texto.startsWith('v1.')) return JSON.parse(texto); // registro antigo, sem cifra
      const [, iv, ct] = texto.split('.');
      const claro = await subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv), additionalData: contexto(userId, colecao, id) },
        await chaveDo(userId), deB64(ct));
      return JSON.parse(new TextDecoder().decode(claro));
    },
  };
}
