import * as sync from './sync.js';
import * as store from './store.js';
import * as auth from './auth.js';
import * as conta from './views/auth.js';
import * as lista from './views/lista.js';
import * as analise from './views/analise.js';
import * as relatorio from './views/relatorio.js';
import * as planejamento from './views/planejamento.js';
import * as adubos from './views/adubos.js';
import * as tabelas from './views/tabelas.js';
import * as config from './views/config.js';
import { icone } from './icons.js';
import { confirmar, toast } from './ui.js';

const main = document.getElementById('app');
const ROTAS_CONTA = ['entrar', 'cadastro', 'esqueci', 'redefinir'];
// Quem está conectado neste aparelho (sem conta: só as telas de entrar/cadastro)
const usuario = auth.usuarioAtual();
if (usuario) store.usarUsuario(usuario.id);
document.body.classList.toggle('sem-conta', !usuario);

const MENU = [
  ['', 'analises', 'Análises', 'Análises'],
  ['forragem', 'pasto', 'Forragem', 'Planejamento forrageiro'],
  ['adubos', 'adubos', 'Adubos', 'Adubos e preços'],
  ['tabelas', 'tabelas', 'Tabelas', 'Tabelas do manual'],
  ['config', 'ajustes', 'Ajustes', 'Ajustes'],
];
document.getElementById('nav').innerHTML = MENU.map(([rota, ic, curto, longo]) =>
  `<a href="#/${rota}">${icone(ic, 22)}<span class="rotulo-curto">${curto}</span><span class="rotulo-longo">${longo}</span></a>`).join('');
let limpar = null;
let rotaAtual = '';

async function rotear() {
  const hash = location.hash || '#/';
  const partes = hash.slice(2).split('/');
  if (typeof limpar === 'function') limpar();
  limpar = null;

  if (!usuario && !ROTAS_CONTA.includes(partes[0])) {
    location.replace('#/entrar');
    return;
  }
  if (partes[0] === 'nova') {
    const id = await analise.criarNova();
    location.replace(`#/analise/${id}/laudo`);
    return;
  }
  if (partes[0] === 'novo-planejamento') {
    const id = await planejamento.criarNovo();
    location.replace(`#/planejamento/${id}/atual/pastagens`);
    return;
  }
  // container novo a cada tela (evita acumular listeners)
  const el = document.createElement('div');
  el.className = 'view';
  main.replaceChildren(el);
  const mudouDeTela = rotaAtual.split('/')[0] !== partes[0] || rotaAtual.split('/')[1] !== partes[1];
  rotaAtual = partes.join('/');
  if (mudouDeTela) window.scrollTo(0, 0);

  const telaDeConta = ROTAS_CONTA.includes(partes[0]);
  document.body.classList.toggle('sem-conta', telaDeConta);
  if (telaDeConta) {
    try {
      await conta.render(el, { tela: partes[0], token: partes[1], usuario });
    } catch (e) {
      console.error(e);
      el.innerHTML = `<div class="aviso erro">Erro ao abrir a tela: ${e.message}</div>`;
    }
    return;
  }

  document.querySelectorAll('.nav a').forEach((a) => {
    const alvo = a.getAttribute('href').slice(2);
    a.classList.toggle('ativo', alvo === partes[0] || (alvo === '' && ['', 'analise', 'relatorio', 'nova'].includes(partes[0]))
      || (alvo === 'forragem' && partes[0] === 'planejamento'));
  });

  try {
    switch (partes[0]) {
      case 'analise': limpar = await analise.render(el, { id: partes[1], aba: partes[2] || 'laudo' }); break;
      case 'relatorio': limpar = await relatorio.render(el, { ids: partes[1] || '' }); break;
      case 'forragem': limpar = await planejamento.renderLista(el); break;
      case 'planejamento': limpar = await planejamento.render(el, { id: partes[1], cenario: partes[2], etapa: partes[3] }); break;
      case 'adubos': limpar = await adubos.render(el); break;
      case 'tabelas': limpar = await tabelas.render(el); break;
      case 'config': limpar = await config.render(el); break;
      default: limpar = await lista.render(el);
    }
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="aviso erro">Erro ao abrir a tela: ${e.message}</div>`;
  }
}

async function atualizarBadge() {
  const i = await sync.info();
  const b = document.getElementById('syncBadge');
  let txt, cls;
  if (!i.online) { txt = i.pendentes ? `Offline · ${i.pendentes} a enviar` : 'Offline'; cls = 'off'; }
  else if (i.rodando) { txt = 'Sincronizando...'; cls = 'run'; }
  else if (i.ultimoErro === sync.SESSAO_EXPIRADA) { txt = 'Entrar novamente'; cls = 'err'; }
  else if (i.ultimoErro) { txt = 'Erro no sync'; cls = 'err'; }
  else if (i.pendentes) { txt = `${i.pendentes} a enviar`; cls = 'pend'; }
  else { txt = 'Sincronizado'; cls = 'ok'; }
  b.querySelector('.sync-txt').textContent = txt;
  b.className = `sync ${cls}`;
  b.title = i.ultimoErro || 'Sincronizar agora';
}

document.getElementById('syncBadge').addEventListener('click', async () => {
  const i = await sync.info();
  if (i.ultimoErro === sync.SESSAO_EXPIRADA) location.hash = '#/entrar';
  else sync.sincronizar();
});
sync.estado.addEventListener('mudou', atualizarBadge);
store.eventos.addEventListener('mudou', (e) => {
  atualizarBadge();
  // dados novos vindos do servidor: redesenha a lista
  if (e.detail?.remoto && ['', '#/', '#/forragem'].includes(location.hash)) rotear();
});
window.addEventListener('hashchange', rotear);

if ('serviceWorker' in navigator) {
  // versão nova do app instalada: recarrega uma vez para usar os arquivos novos
  const tinhaVersao = !!navigator.serviceWorker.controller;
  let recarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (tinhaVersao && !recarregou) { recarregou = true; location.reload(); }
  });
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW não registrado', e));
}

// Dados salvos no aparelho antes de existirem contas: oferece passar para esta conta (uma vez)
async function oferecerDadosAntigos() {
  if (await store.getMeta('legadoVerificado', false)) return;
  const dados = await store.dadosLegados();
  await store.setMeta('legadoVerificado', true);
  if (!dados) return;
  const n = dados.analises.length;
  if (!confirmar(`Este aparelho tem ${n} análise(s) e preços salvos antes das contas existirem.

Passar para a conta de ${usuario.nome} (${usuario.email})?`)) return;
  await store.importarLegado(dados);
  await store.apagarLegado();
  toast(`${n} análise(s) passadas para a sua conta`);
  rotear();
}

rotear();
if (usuario) {
  sync.iniciar();
  atualizarBadge();
  oferecerDadosAntigos().catch((e) => console.warn('dados antigos', e));
  // renova a sessão e atualiza o nome (se mudou em outro aparelho)
  if (navigator.onLine) {
    auth.conferirSessao().then((u) => { if (u) auth.guardarUsuario(u); }).catch(() => {});
  }
}
