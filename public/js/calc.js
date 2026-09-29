// Motor de cálculo: interpretação, necessidade por cultura, conversão em adubos,
// escolha do mais barato, calagem e relação Ca/Mg.
// Funções puras (sem DOM), usadas pela interface e pelos testes.

import { PARAMETROS, CRITERIOS_P, CRITERIOS_K, NIVEIS, classificar, classeArgila } from './data/interpretacao.js';
import { getCultura, parseFaixa, modalidadeId } from './data/culturas.js';

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

// ---------- Passo 2: valores derivados e interpretação ----------

export function derivar(solo = {}) {
  const ca = num(solo.ca), mg = num(solo.mg), k = num(solo.k), na = num(solo.na) ?? 0;
  const al = num(solo.al) ?? 0;
  const sb = ca != null && mg != null && k != null ? ca + mg + k + na : null;
  let hal = num(solo.hal);
  let ctc = null;
  if (sb != null && hal != null) ctc = sb + hal;
  else if (num(solo.ctc) != null) {
    ctc = num(solo.ctc);
    if (sb != null && hal == null) hal = ctc - sb;
  }
  let v = sb != null && ctc ? (sb / ctc) * 100 : num(solo.v);
  const t = sb != null ? sb + al : null;
  const m = t ? (al / t) * 100 : null;
  return {
    sb: r2(sb),
    hal: r2(hal),
    ctc: r2(ctc),
    ctcEfetiva: r2(t),
    v: r2(v),
    m: r2(m),
    kPct: k != null && ctc ? r2((k / ctc) * 100) : null,
    caPct: ca != null && ctc ? r2((ca / ctc) * 100) : null,
    mgPct: mg != null && ctc ? r2((mg / ctc) * 100) : null,
    caMg: ca != null && mg ? r2(ca / mg) : null,
  };
}

// Qual critério de P usar: o escolhido no plano ou a classe de argila
export function criterioP(analise) {
  const plano = analise.plano || {};
  if (plano.criterioP && plano.criterioP !== 'auto') return plano.criterioP;
  return classeArgila(num(analise.solo?.argila)) || plano.classeArgila || '250a400';
}

// Linhas da interpretação (valor + nível) para exibir e para o relatório
export function interpretar(analise) {
  const solo = analise.solo || {};
  const d = derivar(solo);
  const valores = { ...solo, ...d };
  const critP = CRITERIOS_P[criterioP(analise)];
  const critK = CRITERIOS_K[analise.plano?.criterioK || 'geral'];
  const ordem = ['phCaCl2', 'phH2O', 'al', 'ca', 'mg', 'k', 'kPct', 'p', 's', 'mo', 'ctc', 'ctcEfetiva', 'v', 'm', 'b', 'cu', 'mn', 'zn'];
  const linhas = [];
  for (const key of ordem) {
    const par = PARAMETROS[key];
    const valor = num(valores[key]);
    if (valor == null) continue;
    let nivel;
    if (par.criterio === 'P') nivel = classificar(valor, critP.lim, critP.evitar);
    else if (par.criterio === 'K') nivel = classificar(valor, critK.lim, critK.evitar);
    else nivel = classificar(valor * (par.fator || 1), par.lim, par.evitar);
    linhas.push({ key, label: par.label, unidade: par.unidade, valor, nivel, inverso: !!par.inverso });
  }
  // Informativos, sem classe no manual
  if (num(solo.fe) != null) linhas.push({ key: 'fe', label: 'Ferro (Fe)', unidade: 'mg/dm³', valor: num(solo.fe), nivel: null });
  if (d.caMg != null) linhas.push({ key: 'caMg', label: 'Relação Ca/Mg', unidade: '', valor: d.caMg, nivel: null });
  return linhas;
}

export function nivelDe(analise, key) {
  return interpretar(analise).find((l) => l.key === key)?.nivel ?? null;
}

// ---------- Passo 3: necessidade de nutrientes pela tabela da cultura ----------

export function necessidade(analise) {
  const plano = analise.plano || {};
  const cultura = getCultura(plano.culturaId);
  const res = { N: null, P2O5: null, K2O: null, avisos: [], notas: [], cultura, mod: null };
  if (!cultura) return res;
  const modId = modalidadeId(cultura, plano.modalidade);
  const mod = cultura.modalidades[modId];
  res.mod = mod;
  res.modId = modId;
  res.notas = mod.notas || [];

  const nivelP = nivelDe(analise, 'p');
  const nivelK = nivelDe(analise, 'k');
  const iP = NIVEIS.indexOf(nivelP);
  const iK = NIVEIS.indexOf(nivelK);
  if (iP < 0) res.avisos.push('Informe o fósforo (P) da análise para calcular o P₂O₅.');
  if (iK < 0) res.avisos.push('Informe o potássio (K) da análise para calcular o K₂O.');

  const faixa = (f, origem) => {
    const p = parseFaixa(f);
    if (p) p.origem = origem;
    return p;
  };

  if (modId === 'implantacao') {
    const cls = classeArgila(num(analise.solo?.argila)) || plano.classeArgila || '250a400';
    const argilaK = cls === 'gt400' ? 'gt400' : 'le400';
    if (iP >= 0) res.P2O5 = faixa(mod.P2O5[iP], `P ${nivelP}`);
    if (iK >= 0) res.K2O = faixa(mod.K2O[argilaK][iK], `K ${nivelK}, argila ${argilaK === 'gt400' ? '> 400' : '≤ 400'} g/kg`);
    if (mod.N != null) res.N = faixa(mod.N, 'implantação');
    else res.avisos.push('O manual não traz dose de N de implantação para esta cultura. Informe a dose manualmente se precisar.');
  } else {
    const prodIdx = Math.min(Math.max(num(plano.prodIdx) ?? 0, 0), mod.prod.length - 1);
    const opc = mod.opcao?.valores.some((v) => v.id === plano.opcao) ? plano.opcao : mod.opcao?.valores[0].id;
    const mult = mod.multiplicador?.[opc] || {};
    const prodTxt = mod.prod[prodIdx];
    if (iP >= 0) {
      res.P2O5 = faixa(mod.P2O5[iP][prodIdx], `P ${nivelP}, produtividade ${prodTxt}`);
      if (mult.P2O5 && res.P2O5.dose) {
        res.P2O5.dose *= mult.P2O5;
        res.P2O5.origem += ` × ${String(mult.P2O5).replace('.', ',')} (${rotuloOpcao(mod, opc)})`;
      }
    }
    if (iK >= 0) {
      res.K2O = faixa(mod.K2O[iK][prodIdx], `K ${nivelK}, produtividade ${prodTxt}`);
      if (mult.K2O && res.K2O.dose) {
        res.K2O.dose *= mult.K2O;
        res.K2O.origem += ` × ${String(mult.K2O).replace('.', ',')} (${rotuloOpcao(mod, opc)})`;
      }
    }
    if (mod.N?.[opc]) res.N = faixa(mod.N[opc][prodIdx], `${rotuloOpcao(mod, opc)}, produtividade ${prodTxt}`);
  }
  for (const k of ['N', 'P2O5', 'K2O']) {
    if (res[k]?.inviavel) res.avisos.push(`${rotuloNutriente(k)}: produtividade inviável para este nível no solo (manual). Reveja a meta de produtividade ou corrija o solo antes.`);
  }
  if (nivelP === 'Condição a evitar') res.avisos.push('Fósforo em condição a evitar: não adubar com P.');
  return res;
}

function rotuloOpcao(mod, id) {
  return mod.opcao?.valores.find((v) => v.id === id)?.label || id;
}

export function rotuloNutriente(k) {
  return { N: 'N', P2O5: 'P₂O₅', K2O: 'K₂O' }[k] || k;
}

// Dose final (kg/ha) considerando ajuste manual do usuário
export function dosesFinais(analise, nec = necessidade(analise)) {
  const ov = analise.plano?.overrides || {};
  const out = {};
  for (const k of ['N', 'P2O5', 'K2O']) {
    const manual = num(ov[k]);
    out[k] = manual != null ? manual : nec[k]?.dose ?? 0;
  }
  return out;
}

// ---------- Passos 4 e 4b: converter nutriente em adubo e escolher o mais barato ----------

// Gera todas as combinações (fonte de P x fonte de N x fonte de K), com o N do MAP/DAP
// abatendo a necessidade de N, e ordena pelo custo por hectare.
export function planoAdubacao(doses, config, fontesFixas = {}) {
  const adubos = (config.adubos || []).filter((a) => a.ativo !== false);
  const descontarN = config.descontarNdoFosfatado !== false;
  const fixa = (tipo, lista) => (fontesFixas[tipo] && fontesFixas[tipo] !== 'auto' ? lista.filter((a) => a.id === fontesFixas[tipo]) : lista);
  const fontesP = fixa('P', adubos.filter((a) => num(a.P2O5) > 0));
  const fontesK = fixa('K', adubos.filter((a) => num(a.K2O) > 0 && !(num(a.P2O5) > 0)));
  const fontesN = fixa('N', adubos.filter((a) => num(a.N) > 0 && !(num(a.P2O5) > 0) && !(num(a.K2O) > 0)));

  const needP = doses.P2O5 || 0, needK = doses.K2O || 0, needN = doses.N || 0;
  const avisos = [];
  const opsP = needP > 0 ? fontesP : [null];
  const opsK = needK > 0 ? fontesK : [null];
  if (needP > 0 && !fontesP.length) avisos.push('Nenhum adubo fosfatado ativo cadastrado.');
  if (needK > 0 && !fontesK.length) avisos.push('Nenhum adubo potássico ativo cadastrado.');

  const item = (adubo, kgHa, papel) => ({
    aduboId: adubo.id, nome: adubo.nome, sigla: adubo.sigla || adubo.nome, papel,
    kgHa: r1(kgHa),
    custoHa: num(adubo.preco) ? (kgHa / 1000) * num(adubo.preco) : null,
    fornece: {
      N: r1((kgHa * (num(adubo.N) || 0)) / 100),
      P2O5: r1((kgHa * (num(adubo.P2O5) || 0)) / 100),
      K2O: r1((kgHa * (num(adubo.K2O) || 0)) / 100),
      S: r1((kgHa * (num(adubo.S) || 0)) / 100),
      Ca: r1((kgHa * (num(adubo.Ca) || 0)) / 100),
    },
  });

  // K não interage com os outros: escolhe o mais barato isoladamente
  const itensK = opsK.filter(Boolean).map((a) => item(a, needK / (num(a.K2O) / 100), 'K'));
  itensK.sort(ordenaCusto);

  const combos = [];
  for (const p of opsP) {
    const itP = p ? item(p, needP / (num(p.P2O5) / 100), 'P') : null;
    const nDoP = itP && descontarN ? itP.fornece.N : 0;
    const nFalta = Math.max(0, needN - nDoP);
    const opsN = nFalta > 0 ? fontesN : [null];
    if (nFalta > 0 && !fontesN.length) avisos.push('Nenhum adubo nitrogenado ativo cadastrado.');
    for (const n of opsN) {
      const itN = n ? item(n, nFalta / (num(n.N) / 100), 'N') : null;
      const itens = [itP, itN, itensK[0] || null].filter(Boolean);
      const custos = itens.map((i) => i.custoHa);
      combos.push({
        itens,
        custoHa: custos.some((c) => c == null) ? null : custos.reduce((a, b) => a + b, 0),
        chave: itens.map((i) => i.aduboId).join('+'),
      });
    }
  }
  combos.sort(ordenaCusto);
  // Tabela "conversão das fontes de fósforo" (como no exemplo de relatório)
  const conversaoP = needP > 0 ? fontesP.map((a) => item(a, needP / (num(a.P2O5) / 100), 'P')).sort(ordenaCusto) : [];
  return { melhor: combos[0] || { itens: [], custoHa: 0 }, combinacoes: combos, conversaoP, opcoesK: itensK, avisos };
}

function ordenaCusto(a, b) {
  if (a.custoHa == null && b.custoHa == null) return 0;
  if (a.custoHa == null) return 1;
  if (b.custoHa == null) return -1;
  return a.custoHa - b.custoHa;
}

// ---------- Passos 5, 6 e 7: calagem e tipo de calcário ----------

export function calagem(analise, config) {
  const plano = analise.plano || {};
  const cultura = getCultura(plano.culturaId);
  const d = derivar(analise.solo);
  const v1 = d.v;
  const v2 = num(plano.vAlvo) ?? cultura?.vAlvo ?? 60;
  const prnt = num(plano.prnt) ?? num(config.calcario?.prnt) ?? 90;
  const res = { v1, v2, ctc: d.ctc, prnt, nc: null, caMg: d.caMg, tipo: null, motivoTipo: '', avisos: [] };
  if (v1 == null || d.ctc == null) {
    res.avisos.push('Para calcular a calagem informe Ca, Mg, K e H+Al (ou a CTC).');
    return res;
  }
  // NC (t/ha) = (V2 - V1) x CTC / PRNT
  res.nc = r2(Math.max(0, ((v2 - v1) * d.ctc) / prnt));
  const alvo = num(config.relacaoCaMgAlvo) ?? 3;
  if (d.caMg != null) {
    if (d.caMg > alvo) {
      res.tipo = 'dolomitico';
      res.motivoTipo = `Relação Ca/Mg de ${fmtNum(d.caMg)}:1, acima de ${fmtNum(alvo)}:1: falta Mg, usar calcário dolomítico.`;
    } else {
      res.tipo = 'calcitico';
      res.motivoTipo = `Relação Ca/Mg de ${fmtNum(d.caMg)}:1, até ${fmtNum(alvo)}:1: Mg suficiente, usar calcário calcítico.`;
    }
  }
  const ov = plano.overrides || {};
  if (num(ov.calagem) != null) res.nc = num(ov.calagem);
  if (ov.tipoCalcario) res.tipo = ov.tipoCalcario;
  const preco = res.tipo === 'dolomitico' ? num(config.calcario?.precoDolomitico) : num(config.calcario?.precoCalcitico);
  res.custoHa = res.nc != null && preco ? res.nc * preco : null;
  return res;
}

// ---------- Tudo junto ----------

export function recomendar(analise, config) {
  const nec = necessidade(analise);
  const doses = dosesFinais(analise, nec);
  const adub = planoAdubacao(doses, config, analise.plano?.fontes || {});
  const cal = calagem(analise, config);
  const area = num(analise.info?.areaHa) || 0;
  const custoHa = (adub.melhor.custoHa ?? 0) + (cal.custoHa ?? 0);
  return {
    interpretacao: interpretar(analise),
    derivados: derivar(analise.solo),
    necessidade: nec,
    doses,
    adubacao: adub,
    calagem: cal,
    area,
    custoHa,
    custoTotal: custoHa * area,
    avisos: [...nec.avisos, ...adub.avisos, ...cal.avisos],
  };
}

export function fmtNum(v, casas = 2) {
  if (v == null || isNaN(v)) return '-';
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 });
}
