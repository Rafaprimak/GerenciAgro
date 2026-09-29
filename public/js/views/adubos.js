import { getConfig, salvarConfig } from '../config.js';
import { ADUBOS_PADRAO } from '../data/adubos.js';
import * as store from '../store.js';
import { esc, num, fmtInput, debounce, toast, confirmar } from '../ui.js';
import { icone } from '../icons.js';

const CAMPOS = [
  ['N', 'N %'], ['P2O5', 'P₂O₅ %'], ['K2O', 'K₂O %'], ['Ca', 'Ca %'], ['S', 'S %'],
];

export async function render(el) {
  const cfg = await getConfig();
  const salvar = debounce(async () => {
    await salvarConfig(cfg);
  }, 400);

  const campoNum = (attr, label, valor, un = '') => `
    <label class="campo"><span>${label}</span>
      ${un ? `<span class="entrada"><input ${attr} data-t="num" inputmode="decimal" value="${esc(fmtInput(valor))}"><span class="un">${un}</span></span>`
        : `<input ${attr} data-t="num" inputmode="decimal" value="${esc(fmtInput(valor))}">`}</label>`;

  function desenhar() {
    el.innerHTML = `
      <div class="cab">
        <div class="cab-txt">
          <h1>Adubos e preços</h1>
          <div class="cab-sub">Usados para converter N, P₂O₅ e K₂O em produto e escolher o mais barato</div>
        </div>
      </div>

      <section class="card">
        <h2>Calcário</h2>
        <div class="grid">
          ${campoNum('data-c="calcario.prnt"', 'PRNT padrão', cfg.calcario.prnt, '%')}
          ${campoNum('data-c="calcario.precoCalcitico"', 'Calcítico', cfg.calcario.precoCalcitico, 'R$/t')}
          ${campoNum('data-c="calcario.precoDolomitico"', 'Dolomítico', cfg.calcario.precoDolomitico, 'R$/t')}
          ${campoNum('data-c="relacaoCaMgAlvo"', 'Relação Ca:Mg alvo', cfg.relacaoCaMgAlvo, ': 1')}
        </div>
        <p class="muted small" style="margin:12px 0 0">Com a relação Ca/Mg do solo acima do alvo (falta Mg), o app indica calcário dolomítico. Caso contrário, calcítico.</p>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Adubos</h2>
          <button class="btn mini" data-acao="adicionar">${icone('mais', 16)}Adicionar</button>
        </div>
        <label class="interruptor" style="margin-bottom:14px">
          <input type="checkbox" data-c="descontarNdoFosfatado" ${cfg.descontarNdoFosfatado !== false ? 'checked' : ''}>
          Descontar da ureia o N fornecido pelo MAP/DAP
        </label>
        ${cfg.adubos.map((a, i) => `
          <div class="adubo ${a.ativo === false ? 'inativo' : ''}" data-i="${i}">
            <div class="adubo-topo">
              <input class="adubo-nome" data-a="nome" value="${esc(a.nome)}" aria-label="Nome do adubo">
              <label class="interruptor" title="Usar este adubo nos cálculos"><input type="checkbox" data-a="ativo" ${a.ativo !== false ? 'checked' : ''}><span class="sr">Ativo</span></label>
              <button class="btn fantasma icone perigo" data-acao="remover" aria-label="Remover ${esc(a.nome)}">${icone('lixo', 18)}</button>
            </div>
            <div class="grid-adubo">
              <label class="campo"><span>Sigla</span><input data-a="sigla" value="${esc(a.sigla || '')}"></label>
              ${CAMPOS.map(([k, l]) => campoNum(`data-a="${k}"`, l, a[k])).join('')}
              ${campoNum('data-a="preco"', 'Preço R$/t', a.preco)}
            </div>
          </div>`).join('')}
        <div class="acoes" style="margin-bottom:0">
          <button class="btn fantasma" data-acao="restaurar">Restaurar lista padrão</button>
        </div>
      </section>`;
  }

  el.oninput = (e) => {
    const t = e.target;
    if (t.dataset.c) {
      const caminho = t.dataset.c.split('.');
      const valor = t.type === 'checkbox' ? t.checked : num(t.value);
      if (caminho.length === 2) cfg[caminho[0]][caminho[1]] = valor;
      else cfg[caminho[0]] = valor;
      salvar();
    }
    if (t.dataset.a) {
      const i = Number(t.closest('.adubo').dataset.i);
      const k = t.dataset.a;
      cfg.adubos[i][k] = t.type === 'checkbox' ? t.checked : t.dataset.t === 'num' ? num(t.value) ?? 0 : t.value;
      if (k === 'ativo') t.closest('.adubo').classList.toggle('inativo', !t.checked);
      salvar();
    }
  };
  el.onchange = (e) => { if (e.target.type === 'checkbox') el.oninput(e); };

  el.onclick = async (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    if (b.dataset.acao === 'adicionar') {
      cfg.adubos.push({ id: store.uuid(), nome: 'Novo adubo', sigla: '', N: 0, P2O5: 0, K2O: 0, Ca: 0, S: 0, preco: 0, ativo: true });
      await salvarConfig(cfg);
      desenhar();
      const novo = el.querySelectorAll('.adubo-nome');
      novo[novo.length - 1]?.select();
    }
    if (b.dataset.acao === 'remover') {
      const i = Number(b.closest('.adubo').dataset.i);
      if (!confirmar(`Remover ${cfg.adubos[i].nome}?`)) return;
      cfg.adubos.splice(i, 1);
      await salvarConfig(cfg);
      desenhar();
    }
    if (b.dataset.acao === 'restaurar') {
      if (!confirmar('Restaurar a lista padrão de adubos? Os preços digitados serão perdidos.')) return;
      cfg.adubos = structuredClone(ADUBOS_PADRAO);
      await salvarConfig(cfg);
      desenhar();
      toast('Lista padrão restaurada');
    }
  };

  desenhar();
}
