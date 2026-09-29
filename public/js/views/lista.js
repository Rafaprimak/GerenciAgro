import * as store from '../store.js';
import { getConfig } from '../config.js';
import { recomendar, nivelDe } from '../calc.js';
import { getCultura } from '../data/culturas.js';
import { esc, fmt, dataBR, chipNivel } from '../ui.js';
import { icone } from '../icons.js';

const selecionadas = new Set();
let selecionando = false;

export async function render(el) {
  const cfg = await getConfig();
  const lista = (await store.todos('analises')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  for (const id of [...selecionadas]) if (!lista.some((a) => a.id === id)) selecionadas.delete(id);
  if (!lista.length) selecionando = false;

  el.innerHTML = `
    <div class="cab">
      <div class="cab-txt">
        <h1>Análises</h1>
        <div class="cab-sub">${lista.length ? `${lista.length} ${lista.length === 1 ? 'análise' : 'análises'}` : 'Interpretação e recomendação de adubação'}</div>
      </div>
      <div class="cab-acoes">
        ${lista.length ? `<button class="btn fantasma" data-acao="selecionar">${icone(selecionando ? 'x' : 'selecionar', 18)}<span>${selecionando ? 'Cancelar' : 'Relatório'}</span></button>` : ''}
        <a class="btn primario" href="#/nova">${icone('mais', 18)}<span>Nova</span></a>
      </div>
    </div>
    ${lista.length > 3 ? `
      <label class="barra-busca">${icone('busca', 18)}<span class="sr">Buscar</span>
        <input type="search" placeholder="Buscar talhão, propriedade ou produtor"></label>` : ''}
    ${selecionando ? `<p class="muted small">Toque nas análises que devem entrar no relatório.</p>` : ''}
    ${lista.length ? `<div class="lista ${selecionando ? 'selecionando' : ''}">${lista.map((a) => card(a, cfg)).join('')}</div>` : vazio()}
    <div class="barra-sel ${selecionando && selecionadas.size ? 'show' : ''}" role="region" aria-label="Seleção">
      <span><b class="qtd-sel">${selecionadas.size}</b> selecionada(s)</span>
      <button class="btn primario mini" data-acao="relatorio">${icone('arquivo', 16)}Gerar relatório</button>
    </div>`;

  el.querySelector('.barra-busca input')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    el.querySelectorAll('.item').forEach((c) => (c.hidden = q && !c.dataset.busca.includes(q)));
  });

  el.onclick = (e) => {
    const b = e.target.closest('[data-acao]');
    if (b?.dataset.acao === 'selecionar') {
      selecionando = !selecionando;
      if (!selecionando) selecionadas.clear();
      return render(el);
    }
    if (b?.dataset.acao === 'relatorio') {
      location.hash = `#/relatorio/${[...selecionadas].join(',')}`;
      return;
    }
    const item = e.target.closest('.item');
    if (!item) return;
    if (!selecionando) {
      location.hash = `#/analise/${item.dataset.id}/${item.dataset.destino}`;
      return;
    }
    const id = item.dataset.id;
    selecionadas.has(id) ? selecionadas.delete(id) : selecionadas.add(id);
    item.classList.toggle('sel', selecionadas.has(id));
    item.setAttribute('aria-pressed', selecionadas.has(id));
    el.querySelector('.qtd-sel').textContent = selecionadas.size;
    el.querySelector('.barra-sel').classList.toggle('show', selecionadas.size > 0);
  };
  el.onkeydown = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('item')) {
      e.preventDefault();
      e.target.click();
    }
  };
}

function card(a, cfg) {
  const info = a.info || {};
  const cultura = getCultura(a.plano?.culturaId);
  let r = null;
  try { r = recomendar(a, cfg); } catch { /* análise incompleta */ }
  const sel = selecionadas.has(a.id);
  const busca = [info.talhao, info.propriedade, info.produtor, info.municipio, cultura?.nome].join(' ').toLowerCase();
  // abre na etapa que falta: laudo sem valores -> laudo; sem cultura -> cultura; senão resultado
  const temValores = ['ca', 'mg', 'k', 'p'].some((k) => a.solo?.[k] != null);
  const destino = !temValores ? 'laudo' : !cultura ? 'cultura' : 'resultado';
  const kg = (k) => (cultura && r?.doses[k] != null ? fmt(r.doses[k], 0) : '-');
  return `
    <div class="item card ${sel ? 'sel' : ''}" data-id="${esc(a.id)}" data-busca="${esc(busca)}" data-destino="${destino}" tabindex="0" role="button" ${selecionando ? `aria-pressed="${sel}"` : ''}>
      <div class="item-topo">
        <span class="caixa-sel">${icone('check', 14)}</span>
        <div class="item-titulo">
          <strong>${esc(info.talhao || 'Sem nome')}</strong>
          <span>${esc([info.propriedade, info.produtor].filter(Boolean).join(' · ') || 'Propriedade não informada')}</span>
        </div>
        ${a._dirty ? '<span class="item-pend" title="Aguardando sincronizar"></span>' : ''}
        ${icone('chevron', 18)}
      </div>
      <div class="item-tags">
        ${cultura ? `<span class="tag verde">${esc(cultura.nome)}</span>` : '<span class="tag alerta">Escolher cultura</span>'}
        ${info.areaHa ? `<span class="tag">${fmt(info.areaHa, 2)} ha</span>` : ''}
        ${info.dataColeta ? `<span class="tag">${esc(dataBR(info.dataColeta))}</span>` : ''}
        ${a.solo?.p != null ? `<span class="tag">P ${chipNivel(nivelDe(a, 'p'))}</span>` : ''}
        ${a.solo?.k != null ? `<span class="tag">K ${chipNivel(nivelDe(a, 'k'))}</span>` : ''}
      </div>
      ${r && (r.calagem.nc != null || cultura) ? `
        <dl class="item-dados">
          <div><dt>Calcário</dt><dd>${r.calagem.nc != null ? `${fmt(r.calagem.nc, 1)} t` : '-'}</dd></div>
          <div><dt>N</dt><dd>${kg('N')}</dd></div>
          <div><dt>P₂O₅</dt><dd>${kg('P2O5')}</dd></div>
          <div><dt>K₂O</dt><dd>${kg('K2O')}</dd></div>
        </dl>` : ''}
    </div>`;
}

function vazio() {
  return `
    <div class="card vazio">
      <div class="importar-ic">${icone('analises', 26)}</div>
      <h2>Nenhuma análise ainda</h2>
      <p>Tire uma foto do laudo, envie o PDF do laboratório ou digite os valores. O app interpreta e calcula calagem e adubação.</p>
      <a class="btn primario" href="#/nova">${icone('mais', 18)}Nova análise</a>
      <p class="small" style="margin-top:18px">Funciona sem internet. Os dados sincronizam sozinhos quando a conexão voltar.</p>
    </div>`;
}
