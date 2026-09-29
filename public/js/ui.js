import { icone } from './icons.js';

// Utilitários de interface

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

export function fmt(v, casas = 2) {
  if (v == null || v === '' || isNaN(v)) return '-';
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

export function fmtInput(v) {
  if (v == null || v === '') return '';
  return String(v).replace('.', ',');
}

export function moeda(v) {
  if (v == null || isNaN(v)) return '-';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function dataBR(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [a, m, d] = v.slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
  }
  return v;
}

const CLASSE_NIVEL = {
  'Muito baixo': 'mb', Baixo: 'b', 'Médio': 'm', Alto: 'a', 'Muito alto': 'ma', 'Condição a evitar': 'ev',
};

const INVERSO = { mb: 'ma', b: 'a', m: 'm', a: 'b', ma: 'mb', ev: 'ev' };

// inverso = true para indicadores em que valor baixo é bom (Al, m%)
export function chipNivel(nivel, inverso = false) {
  if (!nivel) return '<span class="chip chip-na">-</span>';
  const c = CLASSE_NIVEL[nivel];
  return `<span class="chip chip-${inverso ? INVERSO[c] : c}">${esc(nivel)}</span>`;
}

let toastTimer;
export function toast(msg, tipo = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.className = `toast show ${tipo}`;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 3200);
}

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function confirmar(msg) {
  return window.confirm(msg);
}

// Caixa de aviso com ícone. tipo: 'warn' | 'ok' | 'erro'. conteudo já em HTML seguro.
export function aviso(tipo, conteudo) {
  const ic = { warn: 'alerta', ok: 'check', erro: 'alerta' }[tipo] || 'info';
  return `<div class="aviso ${tipo}" role="${tipo === 'erro' ? 'alert' : 'status'}">${icone(ic, 18)}<div>${conteudo}</div></div>`;
}
