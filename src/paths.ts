import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export function detectCodexHome(): string {
  const candidates = [
    process.env.CODEX_HOME,
    path.join(os.homedir(), '.codex'),
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, '.codex') : undefined,
  ].filter(Boolean) as string[];

  for (const p of candidates) if (fs.existsSync(p)) return p;
  return candidates[0] || path.join(os.homedir(), '.codex');
}
