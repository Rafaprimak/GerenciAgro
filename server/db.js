// Banco de dados do servidor (SQLite embutido no Node >= 22.5).
// Cada registro guarda o JSON completo + updatedAt (para "vence o mais recente")
// + seq (contador global, usado pelos celulares para buscar só o que mudou).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function abrirBanco(arquivo) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS records (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      seq INTEGER NOT NULL,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS idx_records_seq ON records(seq);
  `);

  const maxSeq = () => db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM records').get().s;
  const buscar = db.prepare('SELECT updated_at FROM records WHERE collection = ? AND id = ?');
  const gravar = db.prepare(`
    INSERT INTO records (collection, id, data, updated_at, deleted, seq) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at,
      deleted = excluded.deleted, seq = excluded.seq`);
  const desde = db.prepare('SELECT collection, id, data, updated_at, deleted, seq FROM records WHERE seq > ? ORDER BY seq LIMIT 5000');

  return {
    // Aplica alterações vindas de um celular e devolve o que mudou desde `since`
    sincronizar(since, changes, colecoesPermitidas) {
      db.exec('BEGIN');
      try {
        let seq = maxSeq();
        for (const c of changes) {
          if (!colecoesPermitidas.includes(c.collection) || typeof c.id !== 'string' || !c.id) continue;
          const atual = buscar.get(c.collection, c.id);
          const updatedAt = Number(c.updatedAt) || Date.now();
          if (atual && atual.updated_at > updatedAt) continue; // servidor tem versão mais nova
          // excluído: guarda só a marca (os outros aparelhos precisam saber que sumiu), sem o conteúdo
          gravar.run(c.collection, c.id, JSON.stringify(c.deleted ? {} : c.data ?? {}), updatedAt, c.deleted ? 1 : 0, ++seq);
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      const linhas = desde.all(Number(since) || 0);
      return {
        seq: linhas.length ? linhas[linhas.length - 1].seq : maxSeq(),
        changes: linhas.map((l) => ({
          collection: l.collection, id: l.id, data: JSON.parse(l.data), updatedAt: l.updated_at, deleted: !!l.deleted,
        })),
      };
    },
    contar() {
      return db.prepare('SELECT collection, COUNT(*) AS n FROM records WHERE deleted = 0 GROUP BY collection').all();
    },
    fechar() {
      db.close();
    },
  };
}
