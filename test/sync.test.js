import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrirBanco } from '../server/db.js';

test('sincronização: envia, recebe e resolve conflito pelo mais recente', () => {
  const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ga-')), 'teste.db');
  const db = abrirBanco(arq);
  const COL = ['analises', 'config'];

  // celular A cria uma análise offline e sincroniza
  const a = db.sincronizar(0, [{ collection: 'analises', id: 'x1', updatedAt: 1000, data: { info: { talhao: 'A' } } }], COL);
  assert.equal(a.changes.length, 1);

  // celular B (nunca sincronizou) recebe a análise
  const b = db.sincronizar(0, [], COL);
  assert.equal(b.changes[0].data.info.talhao, 'A');

  // B edita depois (mais novo) e A envia uma edição antiga: vence a de B
  db.sincronizar(b.seq, [{ collection: 'analises', id: 'x1', updatedAt: 3000, data: { info: { talhao: 'B' } } }], COL);
  db.sincronizar(a.seq, [{ collection: 'analises', id: 'x1', updatedAt: 2000, data: { info: { talhao: 'A2' } } }], COL);
  const final = db.sincronizar(0, [], COL);
  assert.equal(final.changes.find((c) => c.id === 'x1').data.info.talhao, 'B');

  // coleções desconhecidas são ignoradas
  db.sincronizar(0, [{ collection: 'hack', id: 'z', updatedAt: 1, data: {} }], COL);
  assert.ok(!db.sincronizar(0, [], COL).changes.some((c) => c.collection === 'hack'));

  // exclusão propaga
  const del = db.sincronizar(final.seq, [{ collection: 'analises', id: 'x1', updatedAt: 4000, deleted: true, data: {} }], COL);
  assert.equal(del.changes[0].deleted, true);
  db.fechar();
});
