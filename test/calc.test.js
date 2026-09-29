import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivar, interpretar, necessidade, calagem, planoAdubacao, recomendar, nivelDe } from '../public/js/calc.js';
import { CONFIG_PADRAO } from '../public/js/data/adubos.js';
import { CULTURAS } from '../public/js/data/culturas.js';
import { NIVEIS } from '../public/js/data/interpretacao.js';

const cfg = structuredClone(CONFIG_PADRAO);

// Exemplo da planilha ("exemplo de interpretação"): Área Tifton - 1 grama doce
const tifton = {
  info: { talhao: 'Tifton', areaHa: 1 },
  solo: { phH2O: 5.65, ca: 4.87, mg: 2.03, k: 0.44, hal: 7.98, al: 0.38, s: 3.32, p: 5.95, mo: 48.68 },
  plano: { culturaId: 'cynodon', modalidade: 'manutencao', prodIdx: 1, opcao: 'pastejo', vAlvo: 60, prnt: 90 },
};
// Área Canto 2
const canto2 = {
  info: { talhao: 'Canto 2' },
  solo: { phH2O: 5.05, ca: 3.03, mg: 1.24, k: 0.30, hal: 12.48, al: 1.78, p: 4.17 },
  plano: { culturaId: 'cynodon', vAlvo: 60, prnt: 90 },
};

test('derivados batem com o laudo (SB, CTC, V%)', () => {
  const d = derivar(tifton.solo);
  assert.equal(d.sb, 7.34);
  assert.equal(d.ctc, 15.32);
  assert.ok(Math.abs(d.v - 47.9) < 0.05);
  const d2 = derivar(canto2.solo);
  assert.equal(d2.sb, 4.57);
  assert.equal(d2.ctc, 17.05);
  assert.ok(Math.abs(d2.v - 26.8) < 0.05);
});

test('calagem igual ao exemplo: Tifton 2,0 t/ha e Canto 2 6,2 t/ha, calcário calcítico', () => {
  const c1 = calagem(tifton, cfg);
  // (60 - 47,9) x 15,32 / 90 = 2,06 (o exemplo arredondou para 2,0)
  assert.ok(Math.abs(c1.nc - 2.06) < 0.01);
  assert.equal(c1.tipo, 'calcitico');
  const c2 = calagem(canto2, cfg);
  // (60 - 26,8) x 17,05 / 90 = 6,29 (o exemplo arredondou para 6,2)
  assert.ok(Math.abs(c2.nc - 6.29) < 0.01);
  assert.equal(c2.tipo, 'calcitico');
});

test('Ca/Mg acima de 3:1 indica calcário dolomítico', () => {
  const a = { solo: { ca: 4, mg: 0.8, k: 0.2, hal: 6 }, plano: { culturaId: 'panicum' } };
  assert.equal(calagem(a, cfg).tipo, 'dolomitico');
});

test('V% já acima do alvo não recomenda calagem', () => {
  const a = { solo: { ca: 8, mg: 3, k: 0.4, hal: 2 }, plano: { culturaId: 'panicum' } };
  assert.equal(calagem(a, cfg).nc, 0);
});

test('interpretação segue as tabelas do manual (exemplo Recomendações 2025, área Guardas)', () => {
  const guardas = { solo: { phCaCl2: 5.19, ca: 7.93, mg: 5.36, k: 0.40, hal: 2.80, al: 0, s: 3.58, b: 0.75, cu: 9.52, mn: 78.24, p: 2.22, mo: 64.59 }, plano: {} };
  const n = (k) => interpretar(guardas).find((l) => l.key === k).nivel;
  assert.equal(n('phCaCl2'), 'Alto');
  assert.equal(n('ca'), 'Muito alto');
  assert.equal(n('mg'), 'Muito alto');
  assert.equal(n('k'), 'Alto');
  assert.equal(n('ctc'), 'Alto');
  assert.equal(n('v'), 'Muito alto');
  assert.equal(n('s'), 'Alto');
  assert.equal(n('b'), 'Muito alto');
  assert.equal(n('cu'), 'Muito alto');
  assert.equal(n('mn'), 'Alto');
  assert.equal(n('mo'), 'Muito alto');
  assert.equal(n('p'), 'Muito baixo'); // 2,22 < 4 (argila 250-400)
});

test('P usa o critério da argila', () => {
  const base = { solo: { p: 8.24 }, plano: {} };
  assert.equal(nivelDe({ ...base, solo: { p: 8.24, argila: 300 } }, 'p'), 'Médio');
  assert.equal(nivelDe({ ...base, solo: { p: 8.24, argila: 500 } }, 'p'), 'Médio');
  assert.equal(nivelDe({ ...base, solo: { p: 8.24, argila: 200 } }, 'p'), 'Baixo');
  assert.equal(nivelDe({ ...base, solo: { p: 5, argila: 500 } }, 'p'), 'Baixo');
});

test('Panicum 18-25 t/ha com P médio = 61-80, média 70,5 (exemplo do WhatsApp)', () => {
  const a = { solo: { p: 10, k: 0.15 }, plano: { culturaId: 'panicum', modalidade: 'manutencao', prodIdx: 2, opcao: 'pastejo' } };
  const nec = necessidade(a);
  assert.equal(nivelDe(a, 'p'), 'Médio');
  assert.equal(nec.P2O5.texto, '61-80');
  assert.equal(nec.P2O5.dose, 70.5);
  assert.equal(nec.K2O.texto, '61-75'); // K 0,15 = Médio
  assert.equal(nec.N.texto, '101-150');
});

test('feno multiplica P por 2,5 e K por 3', () => {
  const a = { solo: { p: 10, k: 0.15 }, plano: { culturaId: 'panicum', modalidade: 'manutencao', prodIdx: 2, opcao: 'feno' } };
  const nec = necessidade(a);
  assert.equal(nec.P2O5.dose, 70.5 * 2.5);
  assert.equal(nec.K2O.dose, 68 * 3);
});

test('implantação usa a coluna de argila para o K', () => {
  const a = { solo: { p: 2, k: 0.05, argila: 500 }, plano: { culturaId: 'braquiaria', modalidade: 'implantacao' } };
  const nec = necessidade(a);
  assert.equal(nec.P2O5.texto, '111-130');
  assert.equal(nec.K2O.texto, '111-130');
  assert.equal(nec.N.dose, 50);
});

test('milho silagem: faixa inviável gera aviso', () => {
  const a = { solo: { p: 1, k: 0.3 }, plano: { culturaId: 'milho_silagem', prodIdx: 3, opcao: 'graminea' } };
  const nec = necessidade(a);
  assert.ok(nec.P2O5.inviavel);
  assert.ok(nec.avisos.some((w) => w.includes('inviável')));
});

test('conversão em adubo: 120 kg P2O5 = 666,7 kg SFS e 230,8 kg MAP (exemplo)', () => {
  const r = planoAdubacao({ N: 0, P2O5: 120, K2O: 60 }, cfg);
  const sfs = r.conversaoP.find((i) => i.aduboId === 'ssp');
  const map = r.conversaoP.find((i) => i.aduboId === 'map');
  assert.equal(sfs.kgHa, 666.7);
  assert.equal(map.kgHa, 230.8);
  assert.equal(r.opcoesK[0].kgHa, 100); // 60 kg K2O = 100 kg KCl
});

test('escolhe a combinação mais barata e desconta o N do MAP', () => {
  const c = structuredClone(cfg);
  c.adubos.find((a) => a.id === 'map').preco = 3000; // MAP barato
  const r = planoAdubacao({ N: 100, P2O5: 120, K2O: 0 }, c);
  const custos = r.combinacoes.map((x) => x.custoHa);
  assert.deepEqual(custos, [...custos].sort((a, b) => a - b));
  const map = r.melhor.itens.find((i) => i.aduboId === 'map');
  assert.ok(map, 'MAP deve ser a fonte de P mais barata');
  const nItem = r.melhor.itens.find((i) => i.papel === 'N');
  assert.ok(Math.abs(nItem.fornece.N - (100 - map.fornece.N)) < 0.2);
});

test('fonte fixada pelo usuário é respeitada', () => {
  const r = planoAdubacao({ N: 50, P2O5: 60, K2O: 0 }, cfg, { P: 'tsp', N: 'sa' });
  assert.deepEqual(r.melhor.itens.map((i) => i.aduboId), ['tsp', 'sa']);
});

test('todas as tabelas das culturas têm o formato certo', () => {
  for (const c of CULTURAS) {
    for (const [id, m] of Object.entries(c.modalidades)) {
      if (id === 'implantacao') {
        assert.equal(m.P2O5.length, NIVEIS.length, `${c.id} P`);
        assert.equal(m.K2O.le400.length, NIVEIS.length);
        assert.equal(m.K2O.gt400.length, NIVEIS.length);
        continue;
      }
      assert.equal(m.P2O5.length, NIVEIS.length, `${c.id} P linhas`);
      assert.equal(m.K2O.length, NIVEIS.length, `${c.id} K linhas`);
      for (const linha of [...m.P2O5, ...m.K2O]) assert.equal(linha.length, m.prod.length, `${c.id} colunas`);
      for (const v of m.opcao.valores) assert.equal(m.N[v.id].length, m.prod.length, `${c.id} N ${v.id}`);
    }
  }
});

test('recomendação completa roda para todas as culturas', () => {
  for (const c of CULTURAS) {
    for (const mod of Object.keys(c.modalidades)) {
      const r = recomendar({ info: { areaHa: 10 }, solo: tifton.solo, plano: { culturaId: c.id, modalidade: mod } }, cfg);
      assert.ok(r.calagem.nc >= 0);
      assert.ok(r.custoTotal >= 0);
    }
  }
});
