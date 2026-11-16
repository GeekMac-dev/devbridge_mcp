import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { openDb } from './db.js';
import { detectCodexHome } from './paths.js';

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

function asText(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v;
  if (Array.isArray(v)) {
    const parts = v.map((x:any) => typeof x === 'string' ? x : x?.text || x?.content || '').filter(Boolean);
    return parts.length ? parts.join('\n') : null;
  }
  return null;
}

function isSessionRecord(obj: any): boolean {
  const type = obj?.type ?? obj?.payload?.type ?? '';
  return type === 'session_meta' || type === 'session_metadata' || type === 'session';
}

function extract(obj: any) {
  const payload = obj?.payload ?? obj;
  const role = payload?.role ?? obj?.role ?? payload?.message?.role ?? null;
  const content = asText(payload?.content) ?? asText(payload?.message?.content) ?? asText(obj?.content) ?? asText(payload?.text) ?? asText(obj?.text);
  const created = obj?.timestamp ?? payload?.timestamp ?? obj?.created_at ?? payload?.created_at ?? null;
  const rawType = obj?.type ?? payload?.type ?? null;
  const cwd = payload?.cwd ?? obj?.cwd ?? payload?.working_directory ?? null;
  const model = payload?.model ?? obj?.model ?? null;
  const title = payload?.title ?? obj?.title ?? null;

  // IMPORTANT: response/message records also have payload.id values such as
  // "msg_...". Those are NOT Codex session IDs. Only trust IDs from session
  // metadata or an explicit session_id field.
  let sid: string | null = null;
  const explicitSid = payload?.session_id ?? obj?.session_id ?? null;
  if (typeof explicitSid === 'string' && explicitSid) sid = explicitSid;
  else if (isSessionRecord(obj)) {
    const metaId = payload?.id ?? obj?.id ?? null;
    if (typeof metaId === 'string' && metaId) sid = metaId;
  }

  return { role, content, created, rawType, cwd, model, title, sid };
}

export async function scanCodexHistory(codexHome = detectCodexHome()) {
  const db = openDb();
  const files = [...walk(path.join(codexHome, 'sessions')), ...walk(path.join(codexHome, 'archived_sessions'))];

  // The database is only a disposable local search index. Rebuild it each scan
  // so parser upgrades never leave stale message/session relationships behind.
  db.exec('DELETE FROM messages; DELETE FROM sessions;');

  const upsertSession = db.prepare(`INSERT INTO sessions(session_id,source_file,cwd,title,model,started_at,updated_at)
    VALUES(@session_id,@source_file,@cwd,@title,@model,@started_at,@updated_at)
    ON CONFLICT(session_id) DO UPDATE SET source_file=excluded.source_file,cwd=COALESCE(excluded.cwd,sessions.cwd),title=COALESCE(excluded.title,sessions.title),model=COALESCE(excluded.model,sessions.model),updated_at=COALESCE(excluded.updated_at,sessions.updated_at)`);
  const insertMessage = db.prepare(`INSERT OR IGNORE INTO messages(session_id,role,content,created_at,raw_type) VALUES(?,?,?,?,?)`);
  let sessionCount = 0, messageCount = 0;

  for (const file of files) {
    const fallbackSid = crypto.createHash('sha1').update(file).digest('hex').slice(0,16);
    let sid = fallbackSid, cwd:string|null=null, title:string|null=null, model:string|null=null, started:string|null=null, updated:string|null=null;
    const pending: Array<{role:any;content:string;created:any;rawType:any}> = [];
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const ex = extract(JSON.parse(line));
        if (ex.sid) sid = ex.sid;
        cwd = ex.cwd ?? cwd; title = ex.title ?? title; model = ex.model ?? model;
        if (ex.created) { started = started ?? ex.created; updated = ex.created; }
        if (ex.content) pending.push({ role: ex.role, content: ex.content, created: ex.created, rawType: ex.rawType });
      } catch { /* tolerate future/unknown JSONL records */ }
    }

    upsertSession.run({session_id:sid,source_file:file,cwd,title,model,started_at:started,updated_at:updated});
    for (const m of pending) {
      const r = insertMessage.run(sid, m.role, m.content, m.created, m.rawType);
      if (r.changes) messageCount++;
    }
    sessionCount++;
  }
  return { codexHome, files: files.length, sessions: sessionCount, parsedMessages: messageCount };
}
