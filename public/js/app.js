import * as sync from './sync.js';
import * as store from './store.js';
import * as lista from './views/lista.js';
import * as analise from './views/analise.js';
import * as relatorio from './views/relatorio.js';
import * as adubos from './views/adubos.js';
import * as tabelas from './views/tabelas.js';
import * as config from './views/config.js';
import { icone } from './icons.js';

const main = document.getElementById('app');

const MENU = [
  ['', 'analises', 'Análises', 'Análises'],
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

  if (partes[0] === 'nova') {
    const id = await analise.criarNova();
    location.replace(`#/analise/${id}/laudo`);
    return;
  }
  // container novo a cada tela (evita acumular listeners)
  const el = document.createElement('div');
  el.className = 'view';
  main.replaceChildren(el);
  const mudouDeTela = rotaAtual.split('/')[0] !== partes[0] || rotaAtual.split('/')[1] !== partes[1];
  rotaAtual = partes.join('/');
  if (mudouDeTela) window.scrollTo(0, 0);

  document.querySelectorAll('.nav a').forEach((a) => {
    const alvo = a.getAttribute('href').slice(2);
    a.classList.toggle('ativo', alvo === partes[0] || (alvo === '' && ['', 'analise', 'relatorio', 'nova'].includes(partes[0])));
  });

  try {
    switch (partes[0]) {
      case 'analise': limpar = await analise.render(el, { id: partes[1], aba: partes[2] || 'laudo' }); break;
      case 'relatorio': limpar = await relatorio.render(el, { ids: partes[1] || '' }); break;
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
  else if (i.ultimoErro === sync.CHAVE_INVALIDA) { txt = 'Informar chave'; cls = 'err'; }
  else if (i.ultimoErro) { txt = 'Erro no sync'; cls = 'err'; }
  else if (i.pendentes) { txt = `${i.pendentes} a enviar`; cls = 'pend'; }
  else { txt = 'Sincronizado'; cls = 'ok'; }
  b.querySelector('.sync-txt').textContent = txt;
  b.className = `sync ${cls}`;
  b.title = i.ultimoErro || 'Sincronizar agora';
}

document.getElementById('syncBadge').addEventListener('click', async () => {
  const i = await sync.info();
  if (i.ultimoErro === sync.CHAVE_INVALIDA) location.hash = '#/config';
  else sync.sincronizar();
});
sync.estado.addEventListener('mudou', atualizarBadge);
store.eventos.addEventListener('mudou', (e) => {
  atualizarBadge();
  // dados novos vindos do servidor: redesenha a lista
  if (e.detail?.remoto && (location.hash === '' || location.hash === '#/')) rotear();
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

// Link de convite com a chave: https://.../?chave=XXXX -> guarda e limpa a barra de endereço
const chaveDoLink = new URLSearchParams(location.search).get('chave');
if (chaveDoLink) {
  await store.setMeta('syncToken', chaveDoLink);
  history.replaceState(null, '', location.pathname + location.hash);
}

rotear();
sync.iniciar();
atualizarBadge();
