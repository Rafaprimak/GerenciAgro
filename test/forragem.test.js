import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCenario, demandaCategoria, producaoPastagem, cenarioPreenchido } from '../public/js/forragem.js';
import { FORRAGEIRAS, CATEGORIAS, CONDICOES } from '../public/js/data/forrageiras.js';

// Caso preenchido na planilha original (Excel, com cálculo iterativo) e resultados copiados dela.
const plano = (regiao) => ({
  regiao,
  atual: {
    pastagens: [
      { forrageiraId: 'b-brizanta', condicao: 'media', area: 10, aproveitamento: 70 },
      { forrageiraId: 'tifton-85', condicao: 'otima', area: 5, aproveitamento: 80 },
      { forrageiraId: 'aveia-preta', condicao: 'degradada', area: 4, aproveitamento: 70 },
    ],
    rebanho: {
      bezerros: { n: 15, entrada: 10, pesoInicial: 180, pesoFinal: 330, consumo: 3, ganho: { verao: 700, outono: 500, inverno: 300, primavera: 650 } },
      novilhosJovens: { n: 20, entrada: 5, pesoInicial: 200, pesoFinal: 400, consumo: 2.5, ganho: { verao: 600, outono: 400, inverno: 200, primavera: 500 } },
      vacas: { n: 30, entrada: 1, pesoInicial: 450, pesoFinal: 450, ganho: {} },
    },
  },
});

const EXCEL = {
  sul: {
    producao: [33.4636, 26.2884, 11.9504, 3.9876, 0, 1.4, 1.68, 1.4, 4.3076, 11.969, 33.4698, 35.0156],
    consumo: [18.754651, 17.421845, 19.696896, 19.444012, 18.006621, 17.730262, 18.547106, 13.9438, 13.719, 16.92755, 17.005762, 18.163636],
    bezerros: [3.529001, 3.434445, 4.018646, 4.091512, 4.444121, 4.422262, 4.699406, 0, 0, 2.511, 2.829262, 3.226286],
    lotacao: [2.741594, 2.815278, 2.871477, 2.925863, 2.62019, 2.650015, 2.089825, 2.104327, 2.139415, 2.509137, 2.578436, 2.660015],
    capacidadeUA: [95.952975, 83.455238, 34.26638, 11.815111, 0, 4.148148, 4.817204, 4.014337, 12.763259, 34.319713, 99.169778, 100.403154],
  },
  norte: {
    producao: [31.876, 23.907, 11.1566, 4.7814, 3.7476, 4.5876, 3.2738, 4.5876, 5.3414, 15.938, 23.907, 31.876],
    capacidadeUA: [91.400717, 75.895238, 31.990251, 14.167111, 10.745806, 13.592889, 9.38724, 13.154409, 15.82637, 45.700358, 70.835556, 91.400717],
  },
};

const perto = (atual, esperado, nome) => {
  assert.equal(atual.length, 12, nome);
  atual.forEach((v, i) => assert.ok(Math.abs(v - esperado[i]) < 1e-5, `${nome}[${i}]: ${v} != ${esperado[i]}`));
};

test('igual à planilha no Sul: produção, consumo, balanço, lotação e capacidade de suporte', () => {
  const r = calcularCenario(plano('sul'), 'atual');
  const x = EXCEL.sul;
  perto(r.producao, x.producao, 'produção');
  perto(r.consumo, x.consumo, 'consumo');
  perto(r.categorias.find((c) => c.id === 'bezerros').mensal, x.bezerros, 'bezerros');
  perto(r.balanco, x.producao.map((p, i) => p - x.consumo[i]), 'balanço');
  perto(r.lotacaoPratica, x.lotacao, 'lotação prática');
  perto(r.capacidadeUA, x.capacidadeUA, 'capacidade');
  assert.equal(r.area, 19);
  assert.equal(r.animais, 65);
  assert.ok(Math.abs(r.pastagens[0].uaHaAno - 1.9491612903) < 1e-6);
});

test('igual à planilha no Norte (distribuição mensal da região)', () => {
  const r = calcularCenario(plano('norte'), 'atual');
  perto(r.producao, EXCEL.norte.producao, 'produção');
  perto(r.capacidadeUA, EXCEL.norte.capacidadeUA, 'capacidade');
});

test('bezerros saem do pasto ao passar do peso final', () => {
  const d = demandaCategoria(plano('sul').atual.rebanho.bezerros);
  // entram em outubro com 180 kg; em agosto já passaram de 330 + 10 kg
  assert.deepEqual(d.presente, [true, true, true, true, true, true, true, false, false, true, true, true]);
});

test('sem peso final, a categoria não entra no consumo (como na planilha)', () => {
  const d = demandaCategoria({ n: 10, entrada: 1, pesoInicial: 300, ganho: { verao: 500, outono: 500, inverno: 500, primavera: 500 } });
  assert.ok(d.presente.every((x) => !x));
  assert.equal(d.total, 0);
});

test('categoria sem animais e pastagem vazia não somam nada', () => {
  assert.equal(demandaCategoria({ n: 0, pesoInicial: 300 }).total, 0);
  assert.equal(producaoPastagem({}).total, 0);
  const r = calcularCenario({}, 'proposto');
  assert.equal(r.producaoTotal, 0);
  assert.equal(r.consumoTotal, 0);
  assert.equal(cenarioPreenchido({}), false);
  assert.equal(cenarioPreenchido(plano('sul').atual), true);
});

test('tabela de forrageiras completa', () => {
  assert.equal(FORRAGEIRAS.length, 26);
  assert.equal(new Set(FORRAGEIRAS.map((f) => f.id)).size, 26);
  for (const f of FORRAGEIRAS) {
    for (const reg of ['sul', 'norte']) {
      assert.equal(f[reg].prod.length, CONDICOES.length, f.nome);
      assert.equal(f[reg].dist.length, 12, f.nome);
      const total = f[reg].dist.reduce((s, v) => s + v, 0);
      assert.ok(total >= 99 && total <= 103, `${f.nome} ${reg}: ${total}%`);
    }
  }
  assert.equal(CATEGORIAS.length, 8);
});

// Caso 2, também calculado no Excel: Norte com Estrela africana (t/ha da tabela do Sul), novilhas adultas
// (fora do consumo total), bezerras sem peso final, peso da U.A. diferente por pastagem e
// cenário proposto com outra área (a lotação prática usa a área atual).
const EXCEL_CASO2 = {
  producao: [25.68, 19.26, 8.988, 3.852, 2.568, 2.568, 1.284, 2.568, 3.852, 12.84, 19.26, 25.68],
  novilhasAdultas: [null, null, 2.325, 2.420625, 2.6214375, 2.649375, 2.8578125, 2.9779375, 2.994375, 3.2143125, 3.223125, null],
  bezerras: [null, null, null, null, null, null, null, null, null, null, null, null],
  consumo: [6.975, 6.3609, 7.06645, 6.861, 7.113725, 6.88425, 7.113725, 7.113725, 6.92025, 7.189365, 6.99345, 7.274615],
  lotacaoPratica: [1.433492063, 1.442380952, 1.935793651, 1.964365079, 1.993888889, 2.017698413, 2.042301587, 2.066904762, 0.633730159, 0.658333333, 0, 0],
  capacidadeUA: [72.129032258, 59.892857143, 25.24516129, 11.18, 7.212903226, 7.453333333, 3.606451613, 7.212903226, 11.18, 36.064516129, 55.9, 72.129032258],
  uaHaAno: [1.605324074, 2.641904762, null],
  uaHaMedia: [1.605324074, 2.641904762, null],
  lotacaoTeorica: [4.978494624, 4.133928571, 1.742473118, 0.771666667, 0.497849462, 0.514444444, 0.248924731, 0.497849462, 0.771666667, 2.489247312, 3.858333333, 4.978494624],
  lotacaoTeoricaMedia: 2.123614418,
  lotacaoPraticaMedia: 1.349074074,
  pProducao: [20.16, 15.12, 7.056, 3.024, 8.736, 18.816, 21.168, 18.816, 9.744, 10.08, 15.12, 20.16],
  pLotacaoPratica: [2.150238095, 2.163571429, 2.659444444, 2.690396825, 2.722380952, 2.746190476, 2.770793651, 2.795396825, 0.633730159, 0.658333333, 0, 0],
  pCapacidadeUA: [57.806451613, 48, 20.232258065, 8.96, 25.049462366, 55.751111111, 60.696774194, 53.952688172, 28.871111111, 28.903225806, 44.8, 57.806451613],
  pLotacaoTeorica: [7.225806452, 6, 2.529032258, 1.12, 1.164157706, 2.447407407, 2.589247312, 2.368458781, 1.38962963, 3.612903226, 5.6, 7.225806452],
  pLotacaoTeoricaMedia: 3.16557945,
  pLotacaoPraticaMedia: 1.832539683,
};

const g = (v) => ({ verao: v, outono: v, inverno: v, primavera: v });
const caso2 = {
  regiao: 'norte',
  atual: {
    pastagens: [
      { forrageiraId: 'estrela-africana', condicao: 'media', area: 6, aproveitamento: 70, pesoUA: 400, consumoUA: 3 },
      { forrageiraId: 'mombaca', condicao: 'otima', area: 8, aproveitamento: 60, pesoUA: 450, consumoUA: 2.5 },
      { forrageiraId: '', condicao: 'degradada', area: 0, aproveitamento: 70, pesoUA: 450, consumoUA: 2.5 },
    ],
    rebanho: {
      novilhasAdultas: { n: 10, entrada: 3, pesoInicial: 300, pesoFinal: 420, consumo: 2.5, ganho: g(500) },
      bezerras: { n: 12, entrada: 7, pesoInicial: 150, pesoFinal: null, consumo: 2.5, ganho: g(600) },
      vacas: { n: 20, entrada: 1, pesoInicial: 450, pesoFinal: 460, consumo: 2.5, ganho: { verao: 100, outono: 50, inverno: 0, primavera: 80 } },
    },
  },
  proposto: {
    pastagens: [
      { forrageiraId: 'aveia-preta', condicao: 'otima', area: 12, aproveitamento: 70, pesoUA: 450, consumoUA: 2.5 },
      { forrageiraId: 'mombaca', condicao: 'otima', area: 8, aproveitamento: 70, pesoUA: 450, consumoUA: 2.5 },
    ],
    rebanho: {
      novilhasAdultas: { n: 10, entrada: 3, pesoInicial: 300, pesoFinal: 420, consumo: 2.5, ganho: g(500) },
      vacas: { n: 30, entrada: 1, pesoInicial: 450, pesoFinal: 460, consumo: 2.5, ganho: { verao: 100, outono: 50, inverno: 0, primavera: 80 } },
    },
  },
};

// compara aceitando null (célula em branco ou #DIV/0! na planilha)
const igual = (atual, esperado, nome) => {
  const A = Array.isArray(esperado) ? atual : [atual];
  const E = Array.isArray(esperado) ? esperado : [esperado];
  E.forEach((e, i) => {
    if (e == null) assert.ok(!A[i], `${nome}[${i}]: esperado em branco, veio ${A[i]}`);
    else assert.ok(Math.abs(A[i] - e) < 1e-6, `${nome}[${i}]: ${A[i]} != ${e}`);
  });
};

test('igual à planilha nas particularidades (caso 2)', () => {
  const x = EXCEL_CASO2;
  const a = calcularCenario(caso2, 'atual');
  const mensalDe = (id) => a.categorias.find((c) => c.id === id)?.mensal ?? Array(12).fill(0);
  igual(a.producao, x.producao, 'produção');
  igual(mensalDe('novilhasAdultas'), x.novilhasAdultas, 'novilhas adultas');
  igual(mensalDe('bezerras'), x.bezerras, 'bezerras');
  igual(a.consumo, x.consumo, 'consumo total');
  igual(a.lotacaoPratica, x.lotacaoPratica, 'lotação prática');
  igual(a.capacidadeUA, x.capacidadeUA, 'capacidade');
  igual(a.pastagens.map((p) => p.uaHaAno), x.uaHaAno, 'U.A./ha/ano');
  igual(a.pastagens.map((p) => p.uaHaMedia), x.uaHaMedia, 'média U.A./ha');
  igual(a.lotacaoTeorica, x.lotacaoTeorica, 'lotação teórica');
  igual(a.lotacaoTeoricaMedia, x.lotacaoTeoricaMedia, 'lotação teórica média');
  igual(a.lotacaoPraticaMedia, x.lotacaoPraticaMedia, 'lotação prática média');

  const p = calcularCenario(caso2, 'proposto');
  igual(p.producao, x.pProducao, 'produção proposta');
  igual(p.lotacaoPratica, x.pLotacaoPratica, 'lotação prática proposta');
  igual(p.capacidadeUA, x.pCapacidadeUA, 'capacidade proposta');
  igual(p.lotacaoTeorica, x.pLotacaoTeorica, 'lotação teórica proposta');
  igual(p.lotacaoTeoricaMedia, x.pLotacaoTeoricaMedia, 'lotação teórica média proposta');
  igual(p.lotacaoPraticaMedia, x.pLotacaoPraticaMedia, 'lotação prática média proposta');
});
