import { openDb, SearchRow } from './db.js';

function tokenize(query: string): string[] {
  return query
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function searchHistory(query: string, limit = 20): SearchRow[] {
  const db = openDb();
  const terms = tokenize(query);
  if (!terms.length) return [];

  // Require every word to be present somewhere in the message/session metadata.
  // This is more useful for natural queries such as "Warehouse Allocation" than
  // requiring the exact contiguous phrase to exist in one field.
  const clauses = terms.map((_, i) => `(
    m.content LIKE @q${i} COLLATE NOCASE OR
    COALESCE(s.cwd,'') LIKE @q${i} COLLATE NOCASE OR
    COALESCE(s.title,'') LIKE @q${i} COLLATE NOCASE
  )`);
  const params: Record<string, string | number> = { limit };
  terms.forEach((term, i) => { params[`q${i}`] = `%${term}%`; });

  return db.prepare(`
    SELECT s.session_id,s.source_file,s.cwd,s.title,m.role,m.content,m.created_at
    FROM messages m
    JOIN sessions s ON s.session_id=m.session_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY COALESCE(m.created_at,'') DESC
    LIMIT @limit
  `).all(params) as SearchRow[];
}

export function latestSessions(limit = 10) {
  const db = openDb();
  return db.prepare(`SELECT session_id,source_file,cwd,title,model,started_at,updated_at FROM sessions ORDER BY COALESCE(updated_at,started_at,'') DESC LIMIT ?`).all(limit);
}

export function getSession(sessionId: string, limit = 200) {
  const db = openDb();
  return db.prepare(`SELECT role,content,created_at,raw_type FROM messages WHERE session_id=? ORDER BY id ASC LIMIT ?`).all(sessionId, limit);
}
