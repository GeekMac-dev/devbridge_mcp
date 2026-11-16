import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

type Grant = { mode: 'always' | 'once' | 'deny'; expiresAt?: number };
type PermissionStore = { version: 1; origins: Record<string, Grant> };
const baseDir = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'CodexBridge');
export const permissionFile = join(baseDir, 'browser-permissions.json');
const empty = (): PermissionStore => ({ version: 1, origins: {} });
const sessionOrigins = new Set<string>();

export function normalizeOrigin(input: string): string {
  const u = new URL(input);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
    throw new Error('Only HTTP(S) origins without credentials are supported.');
  return u.origin;
}
function load(): PermissionStore {
  try {
    const data: unknown = JSON.parse(readFileSync(permissionFile, 'utf8'));
    if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 ||
      !('origins' in data) || !data.origins || typeof data.origins !== 'object' || Array.isArray(data.origins))
      return empty();
    const parsed = data as PermissionStore;
    const origins: Record<string, Grant> = {};
    for (const [origin, entry] of Object.entries(parsed.origins)) {
      if (!entry || typeof entry !== 'object') continue;
      if (!['always','once','deny'].includes(entry.mode)) continue;
      try { if (normalizeOrigin(origin) !== origin) continue; } catch { continue; }
      origins[origin] = { mode: entry.mode, ...(typeof entry.expiresAt === 'number' ? {expiresAt:entry.expiresAt} : {}) };
    }
    return {version:1,origins};
  } catch { return empty(); }
}
function save(data: PermissionStore) {
  mkdirSync(baseDir, { recursive: true, mode: 0o700 });
  writeFileSync(permissionFile, JSON.stringify(data, null, 2) + '\n', {mode:0o600});
}
const configured = () => (process.env.BRIDGE_BROWSER_ALLOWED_ORIGINS || 'http://erp.example.local')
  .split(',').map(s => s.trim()).filter(Boolean).map(normalizeOrigin);

export function getApproval(origin: string): 'allowed' | 'denied' | 'unapproved' {
  const entry = load().origins[origin];
  if (entry?.mode === 'deny') return 'denied';
  if (configured().includes(origin) || sessionOrigins.has(origin) || entry?.mode === 'always') return 'allowed';
  return 'unapproved';
}
export function acquireOrigin(origin: string): boolean {
  const store = load();
  const entry = store.origins[origin];
  if (entry?.mode !== 'once') return getApproval(origin) === 'allowed';
  if (!entry.expiresAt || entry.expiresAt < Date.now()) {
    delete store.origins[origin];
    save(store);
    return false;
  }
  delete store.origins[origin];
  save(store);
  sessionOrigins.add(origin);
  return true;
}
export function clearSessionOrigins() { sessionOrigins.clear(); }
export function approvalStatus() {
  const entries = load().origins;
  return { configuredOrigins: configured(), alwaysAllowed: Object.keys(entries).filter(x => entries[x].mode === 'always'),
    denied: Object.keys(entries).filter(x => entries[x].mode === 'deny'),
    sessionAllowed: [...sessionOrigins] };
}
