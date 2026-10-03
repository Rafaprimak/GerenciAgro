// Banco do servidor Node (SQLite embutido). Mesma interface assíncrona do adaptador do D1
// em worker/index.js, para as rotas (server/api.js) serem um código só.
//   first(sql, ...params) -> linha ou null     all(sql, ...params) -> linhas
//   run(sql, ...params)                         batch([[sql, params], ...]) -> tudo numa transação
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA_MIGRACOES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

// SQLite embutido no Node >= 22.5. Aplica os mesmos arquivos de migrations/ usados no D1.
export function abrirSqlite(arquivo) {
  if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS _migracoes (nome TEXT PRIMARY KEY);
  `);
  const feitas = new Set(db.prepare('SELECT nome FROM _migracoes').all().map((l) => l.nome));
  for (const nome of fs.readdirSync(PASTA_MIGRACOES).filter((n) => n.endsWith('.sql')).sort()) {
    if (feitas.has(nome)) continue;
    db.exec('BEGIN');
    try {
      db.exec(fs.readFileSync(path.join(PASTA_MIGRACOES, nome), 'utf8'));
      db.prepare('INSERT INTO _migracoes (nome) VALUES (?)').run(nome);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Migração ${nome} falhou: ${e.message}`);
    }
  }

  const st = (sql) => db.prepare(sql);
  return {
    async first(sql, ...p) { return st(sql).get(...p) ?? null; },
    async all(sql, ...p) { return st(sql).all(...p); },
    async run(sql, ...p) { st(sql).run(...p); },
    async batch(comandos) {
      db.exec('BEGIN');
      try {
        for (const [sql, p = []] of comandos) st(sql).run(...p);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    bruto: db, // acesso direto (testes)
    fechar() { db.close(); },
  };
}
