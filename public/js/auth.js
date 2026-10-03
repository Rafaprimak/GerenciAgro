// Conta do usuário: entrar, cadastrar, recuperar e trocar a senha.
// A sessão fica num cookie HttpOnly que o servidor define (esta página não tem acesso ao token).
// Aqui fica só quem está conectado (id, nome, e-mail), para o app abrir sem internet.
//
// A senha nunca sai do aparelho como foi digitada: antes vai por PBKDF2-SHA256 com
// 600 mil rodadas (sal = e-mail). O servidor ainda aplica o próprio hash por cima.

const CHAVE_LOCAL = 'ga-usuario';
const ITERACOES = 600000;
export const SENHA_MIN = 8;

export async function esticarSenha(email, senha) {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`gerenciagro|${email.trim().toLowerCase()}`), iterations: ITERACOES },
    chave, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

export function usuarioAtual() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_LOCAL)) || null;
  } catch {
    return null;
  }
}

export function guardarUsuario(u) {
  localStorage.setItem(CHAVE_LOCAL, JSON.stringify({ id: u.id, nome: u.nome, email: u.email }));
}

export function esquecerUsuario() {
  localStorage.removeItem(CHAVE_LOCAL);
}

async function chamar(caminho, corpo) {
  if (!navigator.onLine) throw new Error('Sem internet. Conecte-se para continuar.');
  let resp;
  try {
    resp = await fetch(`/api/${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new Error('Não foi possível falar com o servidor. Verifique a internet.');
  }
  const r = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(r.error || `Servidor respondeu ${resp.status}`);
  return r;
}

export async function entrar(email, senha) {
  return (await chamar('auth/entrar', { email, senha: await esticarSenha(email, senha) })).usuario;
}

export async function cadastrar(nome, email, senha) {
  return (await chamar('auth/cadastro', { nome, email, senha: await esticarSenha(email, senha) })).usuario;
}

export const esqueci = (email) => chamar('auth/esqueci', { email });

// Devolve o e-mail da conta do link (necessário para esticar a senha nova)
export async function verificarLink(token) {
  return (await chamar('auth/redefinir/verificar', { token })).email;
}

export async function redefinir(token, email, senha) {
  return (await chamar('auth/redefinir', { token, senha: await esticarSenha(email, senha) })).usuario;
}

export async function trocarSenha(email, atual, nova) {
  await chamar('auth/senha', { atual: await esticarSenha(email, atual), nova: await esticarSenha(email, nova) });
}

// Encerra a sessão no servidor (sem internet, o cookie expira sozinho)
export async function sair() {
  try {
    await chamar('auth/sair', {});
  } catch { /* offline */ }
}

// Confere a sessão (e a renova). null = expirada; erro = sem conexão
export async function conferirSessao() {
  const resp = await fetch('/api/auth/eu', { cache: 'no-store' });
  if (resp.status === 401) return null;
  if (!resp.ok) throw new Error(`Servidor respondeu ${resp.status}`);
  return (await resp.json()).usuario;
}
