// Planejamento forrageiro: oferta de forragem (pastagens) x demanda do rebanho, mês a mês.
// Reproduz exatamente as fórmulas da planilha "Planejamento Forrageiro" v2.2.4 (UFPR):
//   PRODUÇÃO ATUAL / PROPOSTO     -> producaoPastagem()
//   DEMANDA / DEMANDA PROPOSTA    -> demandaCategoria() e consumo total
//   CAP. SUPORTE ATUAL / PROP.    -> capacidade de suporte e lotação teórica x prática
// Particularidades da planilha mantidas de propósito, para os números baterem com o Excel:
//   - a produção total (t MS/ha/ano) vem sempre da tabela do Sul; só a distribuição mensal muda com a região;
//   - o consumo total não soma as novilhas adultas;
//   - a lotação prática usa U.A. de 450 kg e a área de pastagem do cenário ATUAL (também no proposto);
//   - a lotação teórica é a média simples das pastagens (só as que têm produção no mês);
//   - campo em branco vale zero (sem peso final, a categoria não entra no consumo).

import { getForrageira, CONDICOES, CATEGORIAS, ESTACOES, DIAS_MES, PADROES } from './data/forrageiras.js';

const n = (v) => (v == null || v === '' || isNaN(v) ? 0 : Number(v));
// campo que nunca foi preenchido (planejamento antigo) usa o padrão da planilha; apagado vale zero
const valor = (v, padrao) => (v === undefined ? padrao : n(v));
const soma = (arr) => arr.reduce((s, v) => s + (v ?? 0), 0);
const media = (arr) => {
  const v = arr.filter((x) => x != null);
  return v.length ? soma(v) / v.length : null;
};
const zeros = () => Array(12).fill(0);

export const MAX_PASTAGENS = 5; // a planilha tem 5 linhas de piquetes
const PESO_UA_LOTACAO = 450; // fixo na aba DEMANDA
const SEM_NA_SOMA = ['novilhasAdultas']; // a fórmula do consumo total da planilha não inclui esta linha

// mês -> estação do ganho de peso
const ESTACAO_DO_MES = Array.from({ length: 12 }, (_, m) => ESTACOES.find((e) => e.meses.includes(m)).id);

export function regiaoDe(plano) {
  return plano?.regiao === 'norte' ? 'norte' : 'sul';
}

// ---------- oferta ----------

// p: { forrageiraId, condicao, area (ha), aproveitamento (%) }
export function producaoPastagem(p, regiao = 'sul') {
  const f = getForrageira(p?.forrageiraId);
  const area = n(p?.area);
  const aprov = valor(p?.aproveitamento, PADROES.aproveitamento);
  if (!f) return { forrageira: null, prodHa: 0, area, mensal: zeros(), total: 0 };
  const iCond = Math.max(0, CONDICOES.findIndex((c) => c.id === p.condicao));
  const prodHa = f.sul.prod[iCond]; // a planilha busca sempre na tabela do Sul
  const dist = (f[regiao] || f.sul).dist;
  const mensal = dist.map((pct) => (pct / 100) * prodHa * (aprov / 100) * area);
  return { forrageira: f, prodHa, area, mensal, total: soma(mensal) };
}

// Animais (U.A.) que a pastagem sustenta em cada mês: t MS ÷ (peso U.A. x consumo x dias / 1000).
// Mês sem produção fica em branco (null), como na planilha.
export function capacidadePastagem(p, mensal) {
  const peso = valor(p?.pesoUA, PADROES.pesoUA);
  const consumo = valor(p?.consumoUA, PADROES.consumo) / 100;
  return mensal.map((t, m) => {
    if (!t) return null;
    const porUA = (peso * consumo * DIAS_MES[m]) / 1000;
    return porUA > 0 ? t / porUA : null;
  });
}

// ---------- demanda ----------

// c: { n, entrada (1-12), pesoInicial, pesoFinal, consumo (% PV), ganho: { verao, outono, inverno, primavera } (g/dia) }
// A categoria entra no mês "entrada" e ganha peso nos 12 meses seguintes (o ciclo dá a volta no ano).
// No consumo, sai do pasto quando passa do peso final + 10 kg; na lotação, quando passa do peso final.
export function demandaCategoria(c) {
  const qtd = n(c?.n);
  const vazio = { ativo: false, pesoMedio: Array(12).fill(null), pesoLotacao: zeros(), presente: Array(12).fill(false), mensal: zeros(), total: 0 };
  if (qtd <= 0) return vazio;
  const e = Math.min(12, Math.max(1, Math.round(n(c.entrada) || 1))) - 1;
  const ini = n(c.pesoInicial);
  const fim = n(c.pesoFinal);
  const consumo = valor(c.consumo, PADROES.consumo);
  const ganhoMes = (m) => (n(c.ganho?.[ESTACAO_DO_MES[m]]) / 1000) * DIAS_MES[m];

  // peso no meio de cada mês (linha "PESO MÉDIO DOS ANIMAIS")
  const pesoMedio = Array(12).fill(0);
  pesoMedio[e] = ini + ganhoMes(e) / 2;
  for (let k = 1; k < 12; k++) {
    const m = (e + k) % 12;
    pesoMedio[m] = pesoMedio[(m + 11) % 12] + ganhoMes(m);
  }
  // peso usado no consumo: o inicial no mês de entrada, depois o do mês anterior + ganho do mês
  const pesoConsumo = pesoMedio.map((_, m) => (m === e ? ini : pesoMedio[(m + 11) % 12] + ganhoMes(m)));
  const presente = pesoConsumo.map((p) => p <= fim + 10);
  const mensal = pesoConsumo.map((p, m) => (presente[m] ? (p * consumo * qtd * DIAS_MES[m]) / 100000 : 0));
  const pesoLotacao = pesoMedio.map((p) => (p > fim ? 0 : p));
  return { ativo: true, pesoMedio, pesoLotacao, presente, mensal, total: soma(mensal) };
}

// Sem mês de entrada informado, vale o padrão da categoria (o mesmo que a tela mostra)
export function comEntradaPadrao(catId, c) {
  return { ...c, entrada: c?.entrada || CATEGORIAS.find((x) => x.id === catId)?.entrada || 1 };
}

// ---------- cenário completo ----------

const areaDe = (cen) => soma((cen?.pastagens || []).slice(0, MAX_PASTAGENS).map((p) => n(p.area)));

// Calcula um cenário ('atual' ou 'proposto') do plano.
export function calcularCenario(plano, cenarioId = 'atual') {
  const regiao = regiaoDe(plano);
  const cen = plano?.[cenarioId] || {};

  // ----- PRODUÇÃO e CAP. SUPORTE -----
  const pastagens = (cen.pastagens || []).slice(0, MAX_PASTAGENS).map((p) => {
    const r = producaoPastagem(p, regiao);
    const ua = capacidadePastagem(p, r.mensal);
    const uaHa = ua.map((v) => (v == null || !r.area ? null : v / r.area));
    return {
      ...r,
      id: p.id,
      ua, // animais/piquete/mês
      uaHaAno: r.area ? soma(ua) / 12 / r.area : null, // coluna "U.A./ha/ano"
      uaHa, // U.A./ha de cada mês
      uaHaMedia: r.area ? media(uaHa) : null, // coluna "Média U.A./ha"
      erroMedia: !!r.area && media(uaHa) == null, // #DIV/0! na planilha
    };
  });
  const area = areaDe(cen);
  const producao = zeros().map((_, m) => soma(pastagens.map((p) => p.mensal[m])));
  const capacidadeUA = zeros().map((_, m) => soma(pastagens.map((p) => p.ua[m])));
  const lotacaoTeorica = capacidadeUA.map((tot, m) => (tot === 0 ? null : media(pastagens.map((p) => p.uaHa[m]))));
  const comArea = pastagens.filter((p) => p.area);
  const lotacaoTeoricaMedia = comArea.some((p) => p.erroMedia) ? null : media(comArea.map((p) => p.uaHaMedia));

  // ----- DEMANDA -----
  const categorias = Object.entries(cen.rebanho || {})
    .map(([id, c]) => ({ id, n: n(c?.n), foraDaSoma: SEM_NA_SOMA.includes(id), ...demandaCategoria(comEntradaPadrao(id, c)) }))
    .filter((c) => c.ativo)
    .sort((a, b) => CATEGORIAS.findIndex((x) => x.id === a.id) - CATEGORIAS.findIndex((x) => x.id === b.id));
  const naSoma = categorias.filter((c) => !c.foraDaSoma);
  const consumo = zeros().map((_, m) => soma(naSoma.map((c) => c.mensal[m])));
  const balanco = producao.map((p, m) => p - consumo[m]);

  // lotação prática: peso vivo ÷ 450 ÷ área de pastagem do cenário atual (como na planilha)
  const areaLotacao = areaDe(plano?.atual);
  const pesoVivo = zeros().map((_, m) => soma(categorias.map((c) => c.n * c.pesoLotacao[m])));
  const lotacaoPratica = pesoVivo.map((kg) => (areaLotacao ? kg / PESO_UA_LOTACAO / areaLotacao : null));

  const totalEstacao = (arr) => Object.fromEntries(ESTACOES.map((e) => [e.id, soma(e.meses.map((m) => arr[m]))]));

  return {
    regiao,
    pastagens,
    area,
    producao,
    producaoTotal: soma(producao),
    producaoEstacao: totalEstacao(producao),
    categorias,
    animais: soma(categorias.map((c) => c.n)),
    consumo,
    consumoTotal: soma(consumo),
    balanco,
    balancoTotal: soma(balanco),
    mesesDeficit: balanco.map((b, m) => (b < -1e-9 ? m : -1)).filter((m) => m >= 0),
    capacidadeUA,
    capacidadeEstacao: Object.fromEntries(ESTACOES.map((e) => [e.id, soma(e.meses.map((m) => capacidadeUA[m])) / 3])),
    lotacaoTeorica,
    lotacaoTeoricaMedia,
    lotacaoPratica,
    lotacaoPraticaMedia: areaLotacao ? soma(lotacaoPratica) / 12 : null,
    areaLotacao,
  };
}

// O cenário tem algo preenchido?
export function cenarioPreenchido(cen) {
  return (cen?.pastagens || []).some((p) => p.forrageiraId && n(p.area) > 0)
    || Object.values(cen?.rebanho || {}).some((c) => n(c?.n) > 0);
}
