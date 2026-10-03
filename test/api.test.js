import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { tratarApi } from '../server/api.js';
import { abrirSqlite } from '../server/db.js';
import { novaChaveMestra } from '../server/seguranca.js';
import { esticarSenha } from '../public/js/auth.js';

// Servidor em memória + atalhos para chamar a API como o app faria
function servidor() {
  const db = abrirSqlite(':memory:');
  const emails = [];
  const fundo = [];
  const ctx = {
    db,
    env: { DATA_KEY: novaChaveMestra(), APP_URL: 'https://app.teste' },
    ip: '10.0.0.1',
    aoFundo: (p) => fundo.push(p),
    enviarEmail: async (env, msg) => emails.push(msg),
  };
  async function chamar(caminho, corpo, { cookie, metodo = 'POST', headers = {} } = {}) {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (cookie) h.Cookie = cookie;
    const resp = await tratarApi(new Request(`https://app.teste/api/${caminho}`, {
      method: metodo, headers: h, body: metodo === 'POST' ? JSON.stringify(corpo) : undefined,
    }), ctx);
    return { status: resp.status, body: await resp.json(), cookie: resp.headers.get('Set-Cookie')?.split(';')[0] };
  }
  const cadastrar = async (nome, email, senha) =>
    chamar('auth/cadastro', { nome, email, senha: await esticarSenha(email, senha) });
  const entrar = async (email, senha) => chamar('auth/entrar', { email, senha: await esticarSenha(email, senha) });
  const sync = (cookie, since, changes = []) => chamar('sync', { since, changes }, { cookie });
  return { db, ctx, emails, chamar, cadastrar, entrar, sync, terminarFundo: () => Promise.all(fundo) };
}

test('cadastro, entrar, sessão e sair', async () => {
  const s = servidor();
  const cad = await s.cadastrar('Ana', ' Ana@Fazenda.com ', 'senha-boa-1');
  assert.equal(cad.status, 201);
  assert.equal(cad.body.usuario.email, 'ana@fazenda.com');
  assert.match(cad.cookie, /^ga_sessao=.{43}$/);

  assert.equal((await s.cadastrar('Outra', 'ana@fazenda.com', 'qualquer-1')).status, 409, 'e-mail repetido');
  assert.equal((await s.entrar('ana@fazenda.com', 'errada-123')).status, 401);
  assert.equal((await s.entrar('ninguem@x.com', 'senha-boa-1')).status, 401);

  const ent = await s.entrar('ANA@fazenda.com', 'senha-boa-1');
  assert.equal(ent.status, 200);
  const eu = await s.chamar('auth/eu', null, { cookie: ent.cookie, metodo: 'GET' });
  assert.equal(eu.body.usuario.nome, 'Ana');

  // o banco não guarda senha nem token em texto
  const u = s.db.bruto.prepare('SELECT senha_hash FROM users').get();
  assert.match(u.senha_hash, /^pbkdf2-sha256\$/);
  const token = ent.cookie.split('=')[1];
  assert.equal(s.db.bruto.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?').get(token).n, 0);

  await s.chamar('auth/sair', {}, { cookie: ent.cookie });
  assert.equal((await s.chamar('auth/eu', null, { cookie: ent.cookie, metodo: 'GET' })).status, 401);
  assert.equal((await s.chamar('auth/eu', null, { cookie: cad.cookie, metodo: 'GET' })).status, 200, 'outra sessão continua');
});

test('cada usuário só vê os próprios dados, e eles ficam cifrados no banco', async () => {
  const s = servidor();
  const ana = (await s.cadastrar('Ana', 'ana@x.com', 'senha-ana-1')).cookie;
  const bia = (await s.cadastrar('Bia', 'bia@x.com', 'senha-bia-1')).cookie;

  const r = await s.sync(ana, 0, [{ collection: 'analises', id: 'a1', updatedAt: 1000, data: { info: { talhao: 'Talhão Secreto' } } }]);
  assert.equal(r.status, 200);
  assert.equal(r.body.changes[0].data.info.talhao, 'Talhão Secreto');

  // Bia não recebe nada da Ana, e gravar com o mesmo id não mexe no registro dela
  assert.deepEqual((await s.sync(bia, 0)).body.changes, []);
  await s.sync(bia, 0, [{ collection: 'analises', id: 'a1', updatedAt: 9999, data: { info: { talhao: 'Da Bia' } } }]);
  const daAna = (await s.sync(ana, 0)).body.changes;
  assert.equal(daAna.length, 1);
  assert.equal(daAna[0].data.info.talhao, 'Talhão Secreto');

  // no banco: só texto cifrado
  for (const l of s.db.bruto.prepare('SELECT data FROM records').all()) {
    assert.match(l.data, /^v1\./);
    assert.ok(!l.data.includes('Secreto') && !l.data.includes('Bia'));
  }
  // cifra de um usuário não abre como se fosse de outro (dado copiado no banco)
  s.db.bruto.prepare("UPDATE records SET data = (SELECT data FROM records WHERE user_id = (SELECT id FROM users WHERE email = 'ana@x.com')) WHERE user_id = (SELECT id FROM users WHERE email = 'bia@x.com')").run();
  assert.equal((await s.sync(bia, 0)).status, 500);

  // sem sessão: nada
  assert.equal((await s.sync(null, 0)).status, 401);
  assert.equal((await s.sync('ga_sessao=inventado', 0)).status, 401);
  assert.equal((await s.chamar('extract', { mediaType: 'image/png', data: 'x' })).status, 401);
});

test('sincronização: vence o mais recente e a exclusão propaga', async () => {
  const s = servidor();
  const ana = (await s.cadastrar('Ana', 'ana@x.com', 'senha-ana-1')).cookie;

  const a = (await s.sync(ana, 0, [{ collection: 'analises', id: 'x1', updatedAt: 1000, data: { info: { talhao: 'A' } } }])).body;
  const b = (await s.sync(ana, 0)).body; // outro aparelho da mesma conta
  assert.equal(b.changes[0].data.info.talhao, 'A');

  await s.sync(ana, b.seq, [{ collection: 'analises', id: 'x1', updatedAt: 3000, data: { info: { talhao: 'B' } } }]);
  await s.sync(ana, a.seq, [{ collection: 'analises', id: 'x1', updatedAt: 2000, data: { info: { talhao: 'A2' } } }]);
  const final = (await s.sync(ana, 0)).body;
  assert.equal(final.changes.find((c) => c.id === 'x1').data.info.talhao, 'B');

  await s.sync(ana, 0, [{ collection: 'hack', id: 'z', updatedAt: 1, data: {} }]);
  assert.ok(!(await s.sync(ana, 0)).body.changes.some((c) => c.collection === 'hack'));

  const del = (await s.sync(ana, final.seq, [{ collection: 'analises', id: 'x1', updatedAt: 4000, deleted: true, data: { info: { talhao: 'B' } } }])).body;
  assert.equal(del.changes[0].deleted, true);
  assert.deepEqual(del.changes[0].data, {}, 'conteúdo da análise excluída não fica no servidor');
});

test('esqueci a senha: link por e-mail, uso único, encerra as sessões', async () => {
  const s = servidor();
  const antiga = (await s.cadastrar('Ana', 'ana@x.com', 'senha-velha-1')).cookie;

  // e-mail sem conta: mesma resposta, nenhum e-mail
  assert.equal((await s.chamar('auth/esqueci', { email: 'ninguem@x.com' })).status, 200);
  await s.terminarFundo();
  assert.equal(s.emails.length, 0);

  assert.equal((await s.chamar('auth/esqueci', { email: 'Ana@X.com' })).status, 200);
  await s.terminarFundo();
  assert.equal(s.emails.length, 1);
  const token = s.emails[0].texto.match(/https:\/\/app\.teste\/#\/redefinir\/(\S+)/)[1];

  assert.equal((await s.chamar('auth/redefinir/verificar', { token })).body.email, 'ana@x.com');
  assert.equal((await s.chamar('auth/redefinir/verificar', { token: 'falso' })).status, 400);

  const r = await s.chamar('auth/redefinir', { token, senha: await esticarSenha('ana@x.com', 'senha-nova-1') });
  assert.equal(r.status, 200);
  assert.ok(r.cookie, 'já entra');
  assert.equal((await s.chamar('auth/eu', null, { cookie: antiga, metodo: 'GET' })).status, 401, 'sessão antiga encerrada');
  assert.equal((await s.chamar('auth/redefinir', { token, senha: await esticarSenha('ana@x.com', 'outra-123') })).status, 400, 'link de uso único');
  assert.equal((await s.entrar('ana@x.com', 'senha-velha-1')).status, 401);
  assert.equal((await s.entrar('ana@x.com', 'senha-nova-1')).status, 200);
});

test('trocar senha confere a atual e encerra os outros aparelhos', async () => {
  const s = servidor();
  const celular = (await s.cadastrar('Ana', 'ana@x.com', 'senha-velha-1')).cookie;
  const pc = (await s.entrar('ana@x.com', 'senha-velha-1')).cookie;
  const trocar = async (atual, nova) => s.chamar('auth/senha', {
    atual: await esticarSenha('ana@x.com', atual), nova: await esticarSenha('ana@x.com', nova),
  }, { cookie: celular });

  assert.equal((await trocar('errada-000', 'senha-nova-1')).status, 400);
  assert.equal((await trocar('senha-velha-1', 'senha-nova-1')).status, 200);
  assert.equal((await s.chamar('auth/eu', null, { cookie: celular, metodo: 'GET' })).status, 200);
  assert.equal((await s.chamar('auth/eu', null, { cookie: pc, metodo: 'GET' })).status, 401);
  assert.equal((await s.entrar('ana@x.com', 'senha-nova-1')).status, 200);
});

test('limite de tentativas e proteção contra outro site', async () => {
  const s = servidor();
  await s.cadastrar('Ana', 'ana@x.com', 'senha-ana-1');
  const errada = await esticarSenha('ana@x.com', 'chute-000');
  for (let i = 0; i < 10; i++) assert.equal((await s.chamar('auth/entrar', { email: 'ana@x.com', senha: errada })).status, 401);
  assert.equal((await s.entrar('ana@x.com', 'senha-ana-1')).status, 429, 'bloqueia mesmo com a senha certa');

  assert.equal((await s.chamar('auth/esqueci', { email: 'ana@x.com' }, { headers: { Origin: 'https://site-mau.com' } })).status, 403);
  assert.equal((await s.chamar('auth/esqueci', { email: 'ana@x.com' }, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
});

test('migração: registros de antes das contas ficam sem dono (ninguém vê)', async () => {
  const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ga-')), 'antigo.db');
  const velho = new DatabaseSync(arq);
  velho.exec(fs.readFileSync(new URL('../migrations/0001_inicial.sql', import.meta.url), 'utf8'));
  velho.prepare("INSERT INTO records VALUES ('analises', 'v1', '{\"info\":{}}', 1, 0, 1)").run();
  velho.close();

  const db = abrirSqlite(arq);
  assert.deepEqual({ ...db.bruto.prepare('SELECT user_id, id FROM records').get() }, { user_id: '', id: 'v1' });
  db.fechar();
  abrirSqlite(arq).fechar(); // reabrir não aplica de novo
});
