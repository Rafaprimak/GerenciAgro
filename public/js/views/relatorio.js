import * as store from '../store.js';
import { getConfig } from '../config.js';
import { recomendar, rotuloNutriente } from '../calc.js';
import { getCultura } from '../data/culturas.js';
import { esc, fmt, moeda, dataBR, chipNivel, toast } from '../ui.js';
import { icone } from '../icons.js';

const nomeCalcario = (t) => (t === 'dolomitico' ? 'Calcário dolomítico' : 'Calcário calcítico');

export async function render(el, { ids }) {
  const cfg = await getConfig();
  const analises = [];
  for (const id of ids.split(',')) {
    const a = await store.obter('analises', id);
    if (a && !a.deleted) analises.push(a);
  }
  if (!analises.length) {
    el.innerHTML = '<div class="card vazio"><h2>Nenhuma análise selecionada</h2><p>Na lista, toque em Relatório e escolha as análises.</p><a class="btn" href="#/">Voltar para a lista</a></div>';
    return;
  }
  const recs = analises.map((a) => recomendar(a, cfg));
  const i0 = analises[0].info || {};
  const unico = (campo) => {
    const vals = [...new Set(analises.map((a) => a.info?.[campo]).filter(Boolean))];
    return vals.join(', ');
  };

  el.innerHTML = `
    <div class="cab no-print">
      <a class="btn-voltar" href="${analises.length === 1 ? `#/analise/${esc(analises[0].id)}/resultado` : '#/'}" aria-label="Voltar">${icone('voltar', 22)}</a>
      <div class="cab-txt"><h1>Relatório</h1><div class="cab-sub">${analises.length} ${analises.length === 1 ? 'área' : 'áreas'}</div></div>
    </div>
    <div class="acoes no-print" style="margin-top:0">
      <button class="btn primario" data-acao="imprimir">${icone('imprimir', 18)}Imprimir ou salvar PDF</button>
      <button class="btn" data-acao="compartilhar">${icone('compartilhar', 18)}Compartilhar texto</button>
    </div>
    <article class="relatorio">
      <header class="rel-cab">
        <h1>Interpretação e plano de adubação</h1>
        <p class="rel-sub">${esc([unico('propriedade'), unico('municipio')].filter(Boolean).join(' · ') || 'Análises de solo')}</p>
        <div class="rel-meta">
          ${unico('produtor') ? `<span>Produtor: ${esc(unico('produtor'))}</span>` : ''}
          ${unico('profundidade') ? `<span>Profundidade: ${esc(unico('profundidade'))} cm</span>` : ''}
          ${i0.dataColeta ? `<span>Coleta: ${esc(dataBR(i0.dataColeta))}</span>` : ''}
          <span>Emitido em ${new Date().toLocaleDateString('pt-BR')}</span>
        </div>
      </header>
      <h2>Objetivo</h2>
      <p>Consolidar a interpretação ${analises.length > 1 ? `das ${analises.length} análises` : 'da análise'} de solo e registrar as doses de corretivos e fertilizantes, com a conversão para as fontes comerciais e a estimativa de custo.</p>
      ${analises.map((a, i) => secaoArea(a, recs[i], i + 1, cfg)).join('')}
      ${resumoOperacional(analises, recs)}
      <p class="rel-rodape">Critérios: Manual de Adubação e Calagem para o Estado do Paraná. Calagem: NC = (V2 − V1) × CTC ÷ PRNT. Preços informados pelo usuário em ${new Date().toLocaleDateString('pt-BR')}.</p>
    </article>`;

  el.onclick = async (e) => {
    const b = e.target.closest('[data-acao]');
    if (!b) return;
    if (b.dataset.acao === 'imprimir') window.print();
    if (b.dataset.acao === 'compartilhar') {
      const texto = textoResumo(analises, cfg);
      if (navigator.share) {
        try { await navigator.share({ title: 'Plano de adubação', text: texto }); } catch { /* cancelado */ }
      } else {
        await navigator.clipboard?.writeText(texto);
        toast('Texto copiado');
      }
    }
  };
}

function secaoArea(a, r, n, cfg) {
  const info = a.info || {};
  const cultura = getCultura(a.plano?.culturaId);
  const d = r.derivados;
  const s = a.solo || {};
  const c = r.calagem;
  const area = r.area;
  const itens = r.adubacao.melhor.itens;
  const porPapel = (p) => itens.find((i) => i.papel === p);
  const totalTxt = (kgHa) => (area ? (kgHa * area >= 1000 ? `${fmt((kgHa * area) / 1000, 2)} t` : `${fmt(kgHa * area, 0)} kg`) : '-');
  const linhasPlano = [];
  if (c.nc != null) {
    linhasPlano.push([
      'Calagem', `${fmt(c.nc, 1)} t/ha`, c.nc > 0 ? nomeCalcario(c.tipo) : '-', c.nc > 0 ? `${fmt(c.nc, 1)} t/ha` : 'Não necessária', c.nc > 0 ? totalTxt(c.nc * 1000) : '-',
    ]);
  }
  for (const [k, papel] of [['K2O', 'K'], ['P2O5', 'P'], ['N', 'N']]) {
    const dose = r.doses[k];
    const it = porPapel(papel);
    let fonte = '-', conv = dose ? '-' : 'Não necessária', total = '-';
    if (it) {
      fonte = `${it.nome}`;
      conv = `${fmt(it.kgHa, 1)} kg/ha ${it.sigla}`;
      total = totalTxt(it.kgHa);
    } else if (k === 'N' && dose) {
      const p = porPapel('P');
      if (p?.fornece.N >= dose) { fonte = p.nome; conv = `Suprido pelo ${p.sigla}`; }
    }
    linhasPlano.push([rotuloNutriente(k), `${fmt(dose, 0)} kg/ha`, fonte, conv, total]);
  }
  const conversaoP = r.adubacao.conversaoP;
  const obs = [];
  if (c.motivoTipo && c.nc > 0) obs.push(c.motivoTipo);
  const pItem = porPapel('P');
  if (pItem?.fornece.N > 0 && r.doses.N) obs.push(`O ${pItem.sigla} fornece ${fmt(pItem.fornece.N, 1)} kg/ha de N, já descontado do nitrogenado.`);
  if (a.plano?.observacoes) obs.push(a.plano.observacoes);

  return `
    <section class="rel-area">
      <h2>${n}. Área ${esc(info.talhao || '')}${area ? ` <small>(${fmt(area)} ha)</small>` : ''}</h2>
      <p class="rel-cultura">Cultura: <b>${esc(cultura?.nome || 'não definida')}</b>${r.necessidade.mod ? ` · ${esc(r.necessidade.mod.label)}` : ''}${prodTxt(a, r)}</p>
      <div class="tabela-wrap"><table class="tabela rel-tab">
        <thead><tr><th>Indicador</th><th>Resultado</th><th>Nível</th></tr></thead>
        <tbody>
          ${r.interpretacao.filter((l) => l.key !== 'caMg').map((l) => `<tr><td>${esc(l.label)}</td><td>${fmt(l.valor)} ${esc(l.unidade)}</td><td>${l.nivel ? chipNivel(l.nivel, l.inverso) : ''}</td></tr>`).join('')}
        </tbody>
      </table></div>
      <p class="small">O laudo registra H+Al = ${fmt(d.hal)}; soma de bases = ${fmt(d.sb)}; Al = ${fmt(s.al ?? 0)} cmolc/dm³; matéria orgânica = ${fmt(s.mo)} g/dm³; CTC = ${fmt(d.ctc)} cmolc/dm³; V = ${fmt(d.v)}%; relação Ca/Mg = ${fmt(d.caMg)}:1.</p>
      <h3>Plano de adubação definido</h3>
      <div class="tabela-wrap"><table class="tabela rel-tab">
        <thead><tr><th>Nutriente / corretivo</th><th>Dose definida</th><th>Fonte</th><th>Conversão / dose final</th><th>Total da área</th></tr></thead>
        <tbody>${linhasPlano.map((l) => `<tr>${l.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      ${conversaoP.length > 1 ? `
        <h3>Conversão das fontes de fósforo</h3>
        <div class="tabela-wrap"><table class="tabela rel-tab">
          <thead><tr><th>Fonte</th><th>Garantia considerada</th><th>Para ${fmt(r.doses.P2O5, 0)} kg P₂O₅/ha</th><th>Custo/ha</th></tr></thead>
          <tbody>${conversaoP.map((i) => {
            const ad = cfg.adubos.find((x) => x.id === i.aduboId) || {};
            return `<tr><td>${esc(i.nome)}</td><td>${fmt(ad.P2O5)}% P₂O₅${ad.N ? ` + ${fmt(ad.N)}% N` : ''}</td><td>${fmt(i.kgHa, 1)} kg/ha ${esc(i.sigla)}</td><td>${i.custoHa == null ? '-' : moeda(i.custoHa)}</td></tr>`;
          }).join('')}</tbody>
        </table></div>` : ''}
      <p class="small">Custo estimado: <b>${moeda(r.custoHa)}/ha</b>${area ? ` · <b>${moeda(r.custoTotal)}</b> na área` : ''}.</p>
      ${obs.length ? `<div class="rel-obs">${obs.map((o) => `<p>${esc(o)}</p>`).join('')}</div>` : ''}
    </section>`;
}

function prodTxt(a, r) {
  const mod = r.necessidade.mod;
  if (!mod?.prod) return '';
  const i = Number(a.plano?.prodIdx ?? 0);
  const opc = mod.opcao?.valores.find((v) => v.id === (a.plano?.opcao ?? mod.opcao.valores[0].id));
  return ` · ${esc(mod.prod[i])} t/ha${opc ? ` · ${esc(opc.label)}` : ''}`;
}

function resumoOperacional(analises, recs) {
  const linhas = analises.map((a, i) => {
    const r = recs[i];
    const it = (p) => r.adubacao.melhor.itens.find((x) => x.papel === p);
    const kg = (x) => (x ? `${fmt(x.kgHa, 1)} kg/ha ${x.sigla}` : '-');
    return `<tr>
      <td>${esc(a.info?.talhao || '-')}</td>
      <td>${r.calagem.nc ? `${fmt(r.calagem.nc, 1)} t/ha` : '-'}</td>
      <td>${kg(it('K'))}</td>
      <td>${kg(it('P'))}</td>
      <td>${kg(it('N'))}</td>
      <td>${r.area ? moeda(r.custoTotal) : `${moeda(r.custoHa)}/ha`}</td>
    </tr>`;
  });
  const total = recs.reduce((s, r) => s + (r.custoTotal || 0), 0);
  return `
    <section class="rel-area">
      <h2>${analises.length + 1}. Resumo operacional</h2>
      <div class="tabela-wrap"><table class="tabela rel-tab">
        <thead><tr><th>Área</th><th>Calcário</th><th>Potássio</th><th>Fonte de P</th><th>Nitrogênio</th><th>Custo</th></tr></thead>
        <tbody>${linhas.join('')}</tbody>
        ${total ? `<tfoot><tr><td colspan="5"><b>Custo total estimado</b></td><td><b>${moeda(total)}</b></td></tr></tfoot>` : ''}
      </table></div>
    </section>`;
}

// Texto simples para WhatsApp
export function textoResumo(analises, cfg) {
  const linhas = ['*PLANO DE ADUBAÇÃO - GerenciAgro*'];
  for (const a of analises) {
    const r = recomendar(a, cfg);
    const info = a.info || {};
    const cultura = getCultura(a.plano?.culturaId);
    linhas.push('', `*${info.talhao || 'Área'}*${info.areaHa ? ` (${fmt(info.areaHa)} ha)` : ''}${cultura ? ` - ${cultura.nome}` : ''}`);
    const nivel = (k) => r.interpretacao.find((l) => l.key === k);
    for (const k of ['p', 'k', 'v']) {
      const l = nivel(k);
      if (l) linhas.push(`${l.label}: ${fmt(l.valor)} (${l.nivel})`);
    }
    if (r.calagem.nc != null) linhas.push(`Calagem: ${r.calagem.nc > 0 ? `${fmt(r.calagem.nc, 1)} t/ha de ${nomeCalcario(r.calagem.tipo).toLowerCase()}` : 'não necessária'}`);
    for (const it of r.adubacao.melhor.itens) {
      linhas.push(`${it.nome}: ${fmt(it.kgHa, 1)} kg/ha${r.area ? ` (${fmt((it.kgHa * r.area) / 1000, 2)} t na área)` : ''}`);
    }
    linhas.push(`Custo estimado: ${moeda(r.custoHa)}/ha${r.area ? ` | ${moeda(r.custoTotal)} total` : ''}`);
    if (a.plano?.observacoes) linhas.push(`Obs.: ${a.plano.observacoes}`);
  }
  return linhas.join('\n');
}
