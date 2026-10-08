// Gráfico de linhas mês a mês em SVG (sem biblioteca, funciona offline).
// Passe o dedo/mouse (ou use as setas do teclado) para ver os valores de cada mês.

import { fmt } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
export const CORES = { serie1: '#2a78d6', serie2: '#eb6834', deficit: '#d03b3b' };
const TINTA = { texto2: '#4b5650', muted: '#6b766f', grade: '#e8ebe9', base: '#c5ccc7', fundo: '#ffffff' };

function passoBonito(bruto) {
  const pot = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= bruto);
}

function marcas(min, max, n = 4) {
  if (max === min) max = min + 1;
  const passo = passoBonito((max - min) / n);
  const ini = Math.floor(min / passo) * passo;
  const out = [];
  for (let v = ini; v < max + passo * 0.999; v += passo) out.push(+v.toFixed(10));
  return out;
}

function el(tag, attrs = {}, pai) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (pai) pai.appendChild(e);
  return e;
}

// box: elemento que recebe o gráfico
// cfg: { series: [{ nome, cor, valores: [12] }], rotulos: [12], rotulosLongos: [12], unidade, casas, faixas: [índices], faixaNome }
// Devolve uma função que desliga o observador de tamanho.
export function graficoLinhas(box, cfg) {
  box.classList.add('grafico');
  box.replaceChildren();

  const legenda = document.createElement('div');
  legenda.className = 'graf-legenda';
  for (const s of cfg.series) {
    const item = document.createElement('span');
    const chave = document.createElement('i');
    chave.className = 'chave-linha';
    chave.style.background = s.cor;
    item.append(chave, document.createTextNode(s.nome));
    legenda.appendChild(item);
  }
  if (cfg.faixas?.length) {
    const item = document.createElement('span');
    const chave = document.createElement('i');
    chave.className = 'chave-faixa';
    item.append(chave, document.createTextNode(cfg.faixaNome || 'Destaque'));
    legenda.appendChild(item);
  }

  const area = document.createElement('div');
  area.className = 'graf-area';
  const dica = document.createElement('div');
  dica.className = 'graf-dica';
  dica.hidden = true;
  box.append(legenda, area);

  let largura = 0;
  function desenhar() {
    const W = Math.round(box.clientWidth);
    if (!W || W === largura) return;
    largura = W;
    const H = W < 480 ? 220 : 260;
    const direto = W >= 560 && cfg.series.length <= 4;
    const m = { t: 14, r: direto ? 96 : 10, b: 26, l: 46 };
    const casas = cfg.casas ?? 1;
    const todos = cfg.series.flatMap((s) => s.valores).filter((v) => Number.isFinite(v));
    const ticks = marcas(Math.min(0, ...todos), Math.max(0, ...todos));
    const min = ticks[0];
    const max = ticks[ticks.length - 1];
    const banda = (W - m.l - m.r) / 12;
    const x = (i) => m.l + (i + 0.5) * banda;
    const y = (v) => m.t + ((max - v) / (max - min)) * (H - m.t - m.b);

    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', tabindex: '0',
      'aria-label': `${cfg.series.map((s) => s.nome).join(' e ')} por mês, em ${cfg.unidade}. Use as setas para ver cada mês.` });

    for (const i of cfg.faixas || []) {
      el('rect', { x: m.l + i * banda + 1, y: m.t, width: banda - 2, height: H - m.t - m.b, fill: CORES.deficit, 'fill-opacity': 0.08, rx: 4 }, svg);
    }
    for (const t of ticks) {
      el('line', { x1: m.l, x2: W - m.r, y1: y(t), y2: y(t), stroke: t === 0 ? TINTA.base : TINTA.grade, 'stroke-width': 1 }, svg);
      const tx = el('text', { x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end', fill: TINTA.muted, 'font-size': 11 }, svg);
      tx.textContent = fmt(t, 1);
    }
    const passoX = W < 400 ? 2 : 1;
    cfg.rotulos.forEach((r, i) => {
      if (i % passoX) return;
      const tx = el('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', fill: TINTA.muted, 'font-size': 11 }, svg);
      tx.textContent = r;
    });

    for (const s of cfg.series) {
      const d = s.valores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v || 0).toFixed(1)}`).join('');
      el('path', { d, fill: 'none', stroke: s.cor, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    }

    // rótulo direto no fim de cada linha (afastados para não se sobreporem)
    if (direto) {
      const fins = cfg.series.map((s) => ({ s, yy: y(s.valores[11] || 0) })).sort((a, b) => a.yy - b.yy);
      for (let i = 1; i < fins.length; i++) if (fins[i].yy - fins[i - 1].yy < 14) fins[i].yy = fins[i - 1].yy + 14;
      for (const f of fins) {
        el('line', { x1: x(11) + 8, x2: x(11) + 18, y1: f.yy, y2: f.yy, stroke: f.s.cor, 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
        const tx = el('text', { x: x(11) + 22, y: f.yy + 4, fill: TINTA.texto2, 'font-size': 12 }, svg);
        tx.textContent = f.s.nome;
      }
    }

    // camada de leitura: linha vertical + pontos + dica
    const cursor = el('g', { visibility: 'hidden' }, svg);
    const vertical = el('line', { y1: m.t, y2: H - m.b, stroke: TINTA.base, 'stroke-width': 1 }, cursor);
    const pontos = cfg.series.map((s) => el('circle', { r: 4.5, fill: s.cor, stroke: TINTA.fundo, 'stroke-width': 2 }, cursor));
    const alvo = el('rect', { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: 'transparent' }, svg);

    function mostrar(i) {
      cursor.setAttribute('visibility', 'visible');
      vertical.setAttribute('x1', x(i));
      vertical.setAttribute('x2', x(i));
      cfg.series.forEach((s, k) => { pontos[k].setAttribute('cx', x(i)); pontos[k].setAttribute('cy', y(s.valores[i] || 0)); });
      dica.replaceChildren();
      const tit = document.createElement('b');
      tit.textContent = (cfg.rotulosLongos || cfg.rotulos)[i];
      dica.appendChild(tit);
      for (const s of cfg.series) {
        const linha = document.createElement('div');
        const chave = document.createElement('i');
        chave.className = 'chave-linha';
        chave.style.background = s.cor;
        const valor = document.createElement('strong');
        valor.textContent = `${fmt(s.valores[i], casas)} ${cfg.unidade}`;
        const nome = document.createElement('span');
        nome.textContent = s.nome;
        linha.append(chave, valor, nome);
        dica.appendChild(linha);
      }
      if (cfg.faixas?.includes(i)) {
        const extra = document.createElement('div');
        extra.className = 'graf-dica-alerta';
        extra.textContent = cfg.faixaNome;
        dica.appendChild(extra);
      }
      dica.hidden = false;
      const dw = dica.offsetWidth;
      dica.style.left = `${Math.min(Math.max(0, x(i) + 12 + dw > W ? x(i) - dw - 12 : x(i) + 12), W - dw)}px`;
      dica.style.top = `${m.t}px`;
      atual = i;
    }
    function esconder() {
      cursor.setAttribute('visibility', 'hidden');
      dica.hidden = true;
    }
    let atual = -1;
    const mesDoPonteiro = (ev) => {
      const r = svg.getBoundingClientRect();
      return Math.min(11, Math.max(0, Math.floor((ev.clientX - r.left - m.l) / banda)));
    };
    alvo.addEventListener('pointermove', (ev) => mostrar(mesDoPonteiro(ev)));
    alvo.addEventListener('pointerdown', (ev) => mostrar(mesDoPonteiro(ev)));
    alvo.addEventListener('pointerleave', esconder);
    svg.addEventListener('blur', esconder);
    svg.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
        ev.preventDefault();
        mostrar(atual < 0 ? 0 : (atual + (ev.key === 'ArrowRight' ? 1 : 11)) % 12);
      } else if (ev.key === 'Escape') esconder();
    });

    area.replaceChildren(svg, dica);
  }

  desenhar();
  const obs = new ResizeObserver(() => desenhar());
  obs.observe(box);
  return () => obs.disconnect();
}
