import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { itensDoPdf } from './pdf-helper.js';
import { parseItens, parseTextoGenerico, normalizarSolo } from '../public/js/extract/parsers.js';

const pdf = 'DOCS/pedido107477_amostra722027_SO1_lab1_1835808v01.pdf';

test('lê o laudo PDF da Laborsolo (área Guardas)', { skip: !fs.existsSync(pdf) }, async () => {
  const r = parseItens(await itensDoPdf(pdf));
  assert.equal(r.info.talhao, 'GUARDAS');
  assert.equal(r.info.produtor, 'LAURINDO NICOLAU BUENO');
  assert.equal(r.info.areaHa, 10.2);
  assert.deepEqual(
    { ca: r.solo.ca, mg: r.solo.mg, k: r.solo.k, hal: r.solo.hal, al: r.solo.al, p: r.solo.p, s: r.solo.s, phCaCl2: r.solo.phCaCl2, mo: r.solo.mo, zn: r.solo.zn, v: r.solo.v },
    { ca: 7.93, mg: 5.36, k: 0.4, hal: 2.8, al: 0, p: 2.22, s: 3.58, phCaCl2: 5.19, mo: 64.59, zn: 1.16, v: 83.05 },
  );
});

test('leitor por rótulos (texto de OCR / outros laboratórios)', () => {
  const linhas = [
    'Produtor: Sebastião Brasil Campos Lustosa Profundidade: 0-20 cm',
    'pH em H2O 5,65',
    'pH em CaCl2 4,70',
    'H+Al 7,98',
    'Al3+ 0,38',
    'Matéria orgânica (g/Kg) 48,68',
    'Cálcio (Ca) 4,87',
    'Magnésio (Mg) 2,03',
    'Potássio (K) 0,44',
    'Fósforo Mehlich 1 5,95',
    'Enxofre 3,32',
    'Boro 0,57',
    'Zinco 2,84',
  ];
  const r = parseTextoGenerico(linhas);
  assert.equal(r.solo.phH2O, 5.65);
  assert.equal(r.solo.phCaCl2, 4.7);
  assert.equal(r.solo.hal, 7.98);
  assert.equal(r.solo.al, 0.38);
  assert.equal(r.solo.mo, 48.68);
  assert.equal(r.solo.ca, 4.87);
  assert.equal(r.solo.mg, 2.03);
  assert.equal(r.solo.k, 0.44);
  assert.equal(r.solo.p, 5.95);
  assert.equal(r.solo.s, 3.32);
  assert.equal(r.solo.zn, 2.84);
  assert.equal(r.info.produtor, 'Sebastião Brasil Campos Lustosa');
});

test('converte unidades suspeitas (K em mg/dm³, MO em %)', () => {
  const { solo, avisos } = normalizarSolo({ k: 117.3, mo: 5.7 });
  assert.equal(solo.k, 0.3);
  assert.equal(solo.mo, 57);
  assert.equal(avisos.length, 2);
});

test('descarta valores impossíveis (lixo de OCR)', () => {
  const { solo, avisos } = normalizarSolo({ b: 975, mn: 78.24, phCaCl2: 51.9 });
  assert.equal(solo.b, undefined);
  assert.equal(solo.phCaCl2, undefined);
  assert.equal(solo.mn, 78.24);
  assert.equal(avisos.length, 2);
});
