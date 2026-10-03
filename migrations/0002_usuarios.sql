-- Contas de usuário. Cada registro de dados passa a pertencer a um usuário (user_id).
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,          -- sempre em minúsculas
  nome TEXT NOT NULL,
  senha_hash TEXT NOT NULL,            -- pbkdf2-sha256$iteracoes$sal$hash (nunca a senha)
  criado_em INTEGER NOT NULL
);

-- Sessões: o navegador guarda o token num cookie HttpOnly; aqui fica só o SHA-256 dele
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  criado_em INTEGER NOT NULL,
  expira_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Links de "esqueci a senha" (também só o SHA-256 do token)
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expira_em INTEGER NOT NULL
);

-- Limite de tentativas (login, cadastro, recuperação) por IP e por e-mail
CREATE TABLE IF NOT EXISTS attempts (
  chave TEXT NOT NULL,
  em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts ON attempts(chave, em);

-- records ganha o dono. Registros antigos (de antes das contas) ficam com user_id = ''
-- e não aparecem para ninguém; o app oferece passar os dados do aparelho para a conta.
CREATE TABLE records_novo (
  user_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,                  -- cifrado com AES-256-GCM (chave própria de cada usuário)
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,
  PRIMARY KEY (user_id, collection, id)
);
INSERT INTO records_novo (user_id, collection, id, data, updated_at, deleted, seq)
  SELECT '', collection, id, data, updated_at, deleted, seq FROM records;
DROP TABLE records;
ALTER TABLE records_novo RENAME TO records;
CREATE INDEX IF NOT EXISTS idx_records_user_seq ON records(user_id, seq);
CREATE INDEX IF NOT EXISTS idx_records_seq ON records(seq);
