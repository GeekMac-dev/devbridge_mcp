import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type SearchRow = {
  session_id: string;
  source_file: string;
  cwd: string | null;
  title: string | null;
  role: string | null;
  content: string;
  created_at: string | null;
};

export function openDb(root = process.cwd()) {
  const dir = path.join(root, 'data');
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, 'codex-history.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      source_file TEXT NOT NULL,
      cwd TEXT,
      title TEXT,
      model TEXT,
      started_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT,
      content TEXT NOT NULL,
      created_at TEXT,
      raw_type TEXT,
      UNIQUE(session_id, content, created_at)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
  `);
  return db;
}
