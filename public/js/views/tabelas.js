// Consulta das tabelas usadas nos cálculos (para conferência)
import { CULTURAS } from '../data/culturas.js';
import { PARAMETROS, CRITERIOS_P, CRITERIOS_K, NIVEIS } from '../data/interpretacao.js';
import { esc, fmt } from '../ui.js';
import { icone } from '../icons.js';

const faixas = (lim, evitar, pre = '') => {
  const f = (v) => fmt(v, 2);
  return [`< ${f(lim[0])}`, `${f(lim[0])} a ${f(lim[1])}`, `até ${f(lim[2])}`, `até ${f(lim[3])}`, `> ${f(lim[3])}`, evitar != null ? `> ${f(evitar)}` : '-'].map((x) => pre + x);
};

export async function render(el) {
  const interp = [
    ...Object.entries(PARAMETROS).filter(([, p]) => p.lim).map(([k, p]) => [p.label + (k === 'mo' ? ' (como CO = MO ÷ 1,724)' : ''), faixas(p.lim, p.evitar)]),
    ...Object.values(CRITERIOS_P).map((c) => [`P Mehlich-1: ${c.label}`, faixas(c.lim, c.evitar)]),
    ...Object.values(CRITERIOS_K).map((c) => [`K trocável: ${c.label}`, faixas(c.lim, c.evitar)]),
  ];
  el.innerHTML = `
    <div class="cab"><div class="cab-txt"><h1>Tabelas do manual</h1>
      <div class="cab-sub">Manual de Adubação e Calagem para o Estado do Paraná. A dose usada é a média da faixa.</div></div></div>
    <section class="card">
      <details class="solto"><summary>${icone('chevron', 16)}Interpretação da análise de solo</summary>
        <div class="tabela-wrap"><table class="tabela compacta">
          <thead><tr><th>Parâmetro</th>${NIVEIS.map((n) => `<th>${n}</th>`).join('')}</tr></thead>
          <tbody>${interp.map(([l, f]) => `<tr><td>${esc(l)}</td>${f.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
      </details>
    </section>
    ${CULTURAS.map((c) => `
      <section class="card">
        <details class="solto"><summary>${icone('chevron', 16)}${esc(c.nome)} <span class="muted small" style="font-weight:400">${esc(c.descricao)} · V% alvo ${c.vAlvo}</span></summary>
          ${Object.values(c.modalidades).map((m) => tabelasModalidade(m)).join('')}
        </details>
      </section>`).join('')}`;
}

function tabelasModalidade(m) {
  let h = `<h3>${esc(m.label)} <small class="muted">${esc(m.tabelas)}</small></h3>`;
  if (!m.prod) {
    h += `<div class="tabela-wrap"><table class="tabela compacta"><thead><tr><th>Nível no solo</th><th>P₂O₅</th><th>K₂O argila ≤ 400</th><th>K₂O argila > 400</th></tr></thead><tbody>
      ${NIVEIS.map((n, i) => `<tr><td>${n}</td><td>${m.P2O5[i]}</td><td>${m.K2O.le400[i]}</td><td>${m.K2O.gt400[i]}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="small">N: ${m.N ? `${m.N} kg/ha` : 'não informado no manual'}</p>`;
    return h;
  }
  const cab = `<tr><th></th>${m.prod.map((p) => `<th>${esc(p)}</th>`).join('')}</tr>`;
  h += `<p class="small muted">${esc(m.prodLabel)}</p>`;
  h += `<h4>N (kg/ha)</h4><div class="tabela-wrap"><table class="tabela compacta"><thead>${cab}</thead><tbody>
    ${Object.entries(m.N).map(([k, v]) => `<tr><td>${esc(m.opcao?.valores.find((x) => x.id === k)?.label || k)}</td>${v.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div>`;
  for (const nut of ['P2O5', 'K2O']) {
    const mult = Object.entries(m.multiplicador || {}).map(([k, v]) => `× ${String(v[nut]).replace('.', ',')} para ${m.opcao?.valores.find((x) => x.id === k)?.label || k}`).join('; ');
    h += `<h4>${nut === 'P2O5' ? 'P₂O₅' : 'K₂O'} (kg/ha) ${mult ? `<small class="muted">${esc(mult)}</small>` : ''}</h4>
      <div class="tabela-wrap"><table class="tabela compacta"><thead>${cab}</thead><tbody>
      ${NIVEIS.map((n, i) => `<tr><td>${n}</td>${m[nut][i].map((x) => `<td>${x === 'inv' ? 'Inviável' : x}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>`;
  }
  return h;
}
