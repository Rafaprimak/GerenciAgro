// Telas de conta: entrar, criar conta, esqueci a senha e redefinir a senha (link do e-mail).
import * as auth from '../auth.js';
import { esc, aviso } from '../ui.js';

const campoSenha = (id, rotulo, autocomplete, extra = '') => `
  <label class="campo"><span>${rotulo}</span>
    <div class="senha-campo">
      <input id="${id}" type="password" required autocomplete="${autocomplete}" ${extra}>
      <button type="button" class="senha-ver" data-ver="${id}" aria-label="Mostrar senha">Mostrar</button>
    </div>
  </label>`;

const senhaNova = (rotulo = 'Senha') =>
  campoSenha('senha', `${rotulo} <small>mínimo ${auth.SENHA_MIN} caracteres</small>`, 'new-password', `minlength="${auth.SENHA_MIN}"`)
  + campoSenha('senha2', 'Repita a senha', 'new-password', `minlength="${auth.SENHA_MIN}"`);

function moldura(titulo, sub, corpo, rodape = '') {
  return `
    <div class="auth">
      <div class="auth-marca"><img src="icons/icon.svg" alt="" width="44" height="44"><span>GerenciAgro</span></div>
      <section class="card auth-card">
        <h1>${titulo}</h1>
        ${sub ? `<p class="muted auth-sub">${sub}</p>` : ''}
        <div class="auth-msg" aria-live="polite"></div>
        ${corpo}
      </section>
      ${rodape ? `<p class="auth-rodape">${rodape}</p>` : ''}
    </div>`;
}

const TELAS = {
  entrar: ({ usuario }) => moldura(
    usuario ? 'Entre novamente' : 'Entrar',
    usuario ? 'Confirme sua senha para voltar a sincronizar.' : 'Análise de solo e recomendação de adubação.',
    `<form class="auth-form">
      <label class="campo"><span>E-mail</span>
        <input id="email" type="email" required autocomplete="username" inputmode="email" value="${esc(usuario?.email || '')}"></label>
      ${campoSenha('senha', 'Senha', 'current-password')}
      <button class="btn primario bloco" type="submit">Entrar</button>
      <a class="auth-link" href="#/esqueci">Esqueci a senha</a>
    </form>`,
    usuario ? '<a href="#/">Voltar ao app</a>' : 'Não tem conta? <a href="#/cadastro">Criar conta</a>'),

  cadastro: () => moldura(
    'Criar conta',
    'Suas análises ficam guardadas só na sua conta.',
    `<form class="auth-form">
      <label class="campo"><span>Nome</span><input id="nome" required maxlength="80" autocomplete="name"></label>
      <label class="campo"><span>E-mail</span><input id="email" type="email" required autocomplete="username" inputmode="email"></label>
      ${senhaNova()}
      <button class="btn primario bloco" type="submit">Criar conta</button>
    </form>`,
    'Já tem conta? <a href="#/entrar">Entrar</a>'),

  esqueci: () => moldura(
    'Esqueci a senha',
    'Informe o e-mail da conta. Enviaremos um link para criar uma senha nova.',
    `<form class="auth-form">
      <label class="campo"><span>E-mail</span><input id="email" type="email" required autocomplete="username" inputmode="email"></label>
      <button class="btn primario bloco" type="submit">Enviar link</button>
    </form>`,
    '<a href="#/entrar">Voltar para entrar</a>'),

  redefinir: () => moldura(
    'Nova senha',
    'Verificando o link...',
    `<form class="auth-form" hidden>
      ${senhaNova('Nova senha')}
      <button class="btn primario bloco" type="submit">Salvar nova senha</button>
    </form>`,
    '<a href="#/entrar">Voltar para entrar</a>'),
};

// Conectou: guarda quem é e recarrega o app já com o banco desse usuário.
// Sem o "#" a navegação é completa (mudar só o hash acionaria o roteador antes de recarregar).
function concluir(usuario) {
  auth.guardarUsuario(usuario);
  location.replace(location.pathname);
}

export async function render(el, { tela, token, usuario }) {
  el.innerHTML = (TELAS[tela] || TELAS.entrar)({ usuario });
  const form = el.querySelector('form');
  const msg = el.querySelector('.auth-msg');
  const valor = (id) => el.querySelector(`#${id}`)?.value.trim() ?? '';
  const mostrar = (tipo, texto) => (msg.innerHTML = texto ? aviso(tipo, esc(texto)) : '');
  let emailDoLink = '';

  el.querySelectorAll('[data-ver]').forEach((b) => {
    b.onclick = () => {
      const input = el.querySelector(`#${b.dataset.ver}`);
      const ver = input.type === 'password';
      input.type = ver ? 'text' : 'password';
      b.textContent = ver ? 'Ocultar' : 'Mostrar';
      b.setAttribute('aria-label', ver ? 'Ocultar senha' : 'Mostrar senha');
    };
  });

  if (tela === 'redefinir') {
    try {
      emailDoLink = await auth.verificarLink(token || '');
      el.querySelector('.auth-sub').innerHTML = `Crie uma senha nova para <strong>${esc(emailDoLink)}</strong>.`;
      form.hidden = false;
    } catch (e) {
      el.querySelector('.auth-sub').remove();
      msg.innerHTML = aviso('erro', `${esc(e.message)}`);
      return;
    }
  }
  // "Entre novamente": o e-mail já vem preenchido
  (tela === 'entrar' && usuario ? el.querySelector('#senha') : form.querySelector('input')).focus();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const botao = form.querySelector('[type=submit]');
    const senha = el.querySelector('#senha')?.value ?? '';
    if (el.querySelector('#senha2') && senha !== el.querySelector('#senha2').value) {
      return mostrar('erro', 'As duas senhas não são iguais.');
    }
    const rotulo = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Aguarde...';
    mostrar('', '');
    try {
      if (tela === 'cadastro') concluir(await auth.cadastrar(valor('nome'), valor('email'), senha));
      else if (tela === 'esqueci') {
        await auth.esqueci(valor('email'));
        form.hidden = true;
        mostrar('ok', `Se existir uma conta com ${valor('email')}, enviamos um link para criar uma senha nova. Ele vale por 30 minutos. Confira também a caixa de spam.`);
      } else if (tela === 'redefinir') concluir(await auth.redefinir(token, emailDoLink, senha));
      else concluir(await auth.entrar(valor('email'), senha));
    } catch (err) {
      mostrar('erro', err.message);
    } finally {
      botao.disabled = false;
      botao.textContent = rotulo;
    }
  };
}
