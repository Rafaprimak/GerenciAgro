import * as store from '../store.js';
import * as sync from '../sync.js';
import * as auth from '../auth.js';
import { prepararOcrOffline, iaDisponivel } from '../extract/index.js';
import { icone } from '../icons.js';
import { esc, toast, confirmar } from '../ui.js';

export async function render(el) {
  const usuario = auth.usuarioAtual();
  const ocrPronto = await store.getMeta('ocrOffline', false);

  async function desenharStatus() {
    const i = await sync.info();
    const box = el.querySelector('#syncInfo');
    if (!box) return;
    box.innerHTML = `
      <dl class="dl-linhas">
        <div><dt>Conexão</dt><dd>${i.online ? 'Online' : 'Offline'}</dd></div>
        <div><dt>Alterações a enviar</dt><dd>${i.pendentes}</dd></div>
        <div><dt>Última sincronização</dt><dd>${i.ultimoSync ? new Date(i.ultimoSync).toLocaleString('pt-BR') : 'Nunca'}</dd></div>
        ${i.ultimoErro ? `<div><dt>Erro</dt><dd class="erro-txt">${esc(i.ultimoErro)}</dd></div>` : ''}
      </dl>`;
  }

  el.innerHTML = `
    <div class="cab"><div class="cab-txt"><h1>Ajustes</h1><div class="cab-sub">Conta, sincronização, leitura de fotos e backup</div></div></div>
    <section class="card">
      <h2>Conta</h2>
      <dl class="dl-linhas">
        <div><dt>Nome</dt><dd>${esc(usuario.nome)}</dd></div>
        <div><dt>E-mail</dt><dd>${esc(usuario.email)}</dd></div>
      </dl>
      <form id="formSenha" class="auth-form" style="margin-top:14px" hidden>
        <label class="campo"><span>Senha atual</span><input id="senhaAtual" type="password" required autocomplete="current-password"></label>
        <div class="grid-2">
          <label class="campo"><span>Nova senha <small>mínimo ${auth.SENHA_MIN} caracteres</small></span>
            <input id="senhaNova" type="password" required minlength="${auth.SENHA_MIN}" autocomplete="new-password"></label>
          <label class="campo"><span>Repita a nova senha</span>
            <input id="senhaNova2" type="password" required minlength="${auth.SENHA_MIN}" autocomplete="new-password"></label>
        </div>
        <div class="acoes" style="margin:0">
          <button class="btn primario" type="submit">Salvar nova senha</button>
          <button class="btn fantasma" type="button" data-acao="senha">Cancelar</button>
        </div>
      </form>
      <div class="acoes" style="margin-bottom:0" id="acoesConta">
        <button class="btn" data-acao="senha">Trocar senha</button>
        <button class="btn perigo" data-acao="sair">Sair da conta</button>
      </div>
    </section>
    <section class="card">
      <h2>Sincronização</h2>
      <div id="syncInfo"></div>
      <div class="acoes" style="margin-bottom:0">
        <button class="btn primario" data-acao="sync">${icone('sync', 18)}Sincronizar agora</button>
      </div>
    </section>
    <section class="card">
      <h2>Leitura de fotos do laudo</h2>
      <dl class="dl-linhas">
        <div><dt>PDF do laboratório</dt><dd>Leitura exata, sem internet</dd></div>
        <div><dt>Foto com internet (IA)</dt><dd id="iaStatus">Verificando...</dd></div>
        <div><dt>Foto sem internet (OCR)</dt><dd id="ocrStatus">${ocrPronto ? 'Pronto' : 'Não baixado'}</dd></div>
      </dl>
      <p class="muted small" style="margin:12px 0">O OCR no aparelho tem precisão limitada: funciona em laudos simples, em lista. A IA lê bem qualquer laudo, mas precisa de internet e de uma chave configurada no servidor (ANTHROPIC_API_KEY).</p>
      <button class="btn" data-acao="ocr">${icone('download', 18)}${ocrPronto ? 'Baixar OCR novamente' : 'Baixar OCR para uso offline (15 MB)'}</button>
    </section>
    <section class="card">
      <h2>Backup</h2>
      <p class="muted small">Cópia de todas as análises e preços deste aparelho, em um arquivo.</p>
      <div class="acoes" style="margin-bottom:0">
        <button class="btn" data-acao="exportar">${icone('download', 18)}Exportar backup</button>
        <label class="btn">${icone('upload', 18)}Importar backup<input type="file" accept="application/json" hidden id="importar"></label>
      </div>
    </section>
    <section class="card">
      <h2>Instalar no celular</h2>
      <dl class="dl-linhas">
        <div><dt>Android (Chrome)</dt><dd>Menu → Instalar app</dd></div>
        <div><dt>iPhone (Safari)</dt><dd>Compartilhar → Adicionar à Tela de Início</dd></div>
      </dl>
      <p class="muted small" style="margin:12px 0 0">Depois de instalado, o app abre sem internet.</p>
    </section>`;
  desenharStatus();
  iaDisponivel().then((ok) => {
    const d = el.querySelector('#iaStatus');
    if (d) d.textContent = ok ? 'Ativa' : navigator.onLine ? 'Desativada no servidor' : 'Sem internet agora';
  });
  const onSync = () => desenharStatus();
  sync.estado.addEventListener('mudou', onSync);

  el.onclick = async (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    const acao = b.dataset.acao;
    if (acao === 'senha') {
      const form = el.querySelector('#formSenha');
      form.hidden = !form.hidden;
      el.querySelector('#acoesConta').hidden = !form.hidden;
      form.reset();
      if (!form.hidden) form.querySelector('input').focus();
    }
    if (acao === 'sair') await sairDaConta(b);
    if (acao === 'sync') {
      if (!navigator.onLine) return toast('Sem internet no momento', 'erro');
      await sync.sincronizar();
      const i = await sync.info();
      toast(i.ultimoErro ? `Falhou: ${i.ultimoErro}` : 'Sincronizado', i.ultimoErro ? 'erro' : '');
    }
    if (acao === 'ocr') {
      const st = el.querySelector('#ocrStatus');
      b.disabled = true;
      try {
        await prepararOcrOffline((m) => (st.textContent = m));
        await store.setMeta('ocrOffline', true);
        st.textContent = 'Pronto';
      } catch (err) {
        st.textContent = `erro: ${err.message}`;
      } finally {
        b.disabled = false;
      }
    }
    if (acao === 'exportar') {
      const dados = { versao: 1, exportadoEm: new Date().toISOString(), analises: await store.todos('analises', { incluirExcluidos: true }), config: await store.todos('config') };
      const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `gerenciagro-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };
  el.querySelector('#formSenha').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const nova = el.querySelector('#senhaNova').value;
    if (nova !== el.querySelector('#senhaNova2').value) return toast('As duas senhas novas não são iguais', 'erro');
    const botao = form.querySelector('[type=submit]');
    botao.disabled = true;
    try {
      await auth.trocarSenha(usuario.email, el.querySelector('#senhaAtual').value, nova);
      form.reset();
      form.hidden = true;
      el.querySelector('#acoesConta').hidden = false;
      toast('Senha trocada. Os outros aparelhos vão pedir a senha nova.');
    } catch (err) {
      toast(err.message, 'erro');
    } finally {
      botao.disabled = false;
    }
  };
  el.onchange = async (e) => {
    if (e.target.id !== 'importar' || !e.target.files[0]) return;
    try {
      const dados = JSON.parse(await e.target.files[0].text());
      if (!confirmar(`Importar ${dados.analises?.length || 0} análises? Registros com o mesmo ID serão substituídos.`)) return;
      for (const a of dados.analises || []) await store.salvar('analises', a);
      for (const c of dados.config || []) await store.salvar('config', c);
      toast('Backup importado');
    } catch (err) {
      toast(`Arquivo inválido: ${err.message}`, 'erro');
    }
  };
  return () => sync.estado.removeEventListener('mudou', onSync);
}

// Envia o que falta, avisa se algo ficaria para trás e apaga os dados deste usuário do aparelho
async function sairDaConta(botao) {
  botao.disabled = true;
  try {
    await sync.sincronizar();
    const { pendentes } = await sync.info();
    if (pendentes && !confirmar(`${pendentes} alteração(ões) ainda não foram enviadas ao servidor e serão perdidas se você sair agora.

Sair mesmo assim?`)) return;
    await auth.sair();
    await store.limparTudo();
    auth.esquecerUsuario();
    location.replace(location.pathname); // recarrega sem usuário: abre a tela de entrar
  } finally {
    botao.disabled = false;
  }
}
