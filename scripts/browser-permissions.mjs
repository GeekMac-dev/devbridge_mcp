import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
const file = join(process.env.LOCALAPPDATA || join(homedir(),'AppData','Local'), 'CodexBridge','browser-permissions.json');
const usage = () => {
  console.log('Usage: node scripts/browser-permissions.mjs <allow-once|always|deny|revoke|list> [https://example.com]');
  console.log('Approvals affect only the dedicated Chrome testing profile. They never permit form submission without a separate confirmation.');
};
const [action,raw] = process.argv.slice(2);
if (action === 'list') {
  try { const db = JSON.parse(readFileSync(file,'utf8')); console.log(JSON.stringify(db.origins || {},null,2)); }
  catch { console.log('No saved website approvals.'); }
  process.exit(0);
}
if (!['allow-once','always','deny','revoke'].includes(action) || !raw) { usage(); process.exitCode=1; }
else {
  try {
    const u = new URL(raw);
    if (!['http:','https:'].includes(u.protocol) || u.username || u.password)
      throw new Error('Only HTTP(S) origins without credentials are allowed.');
    const origin = u.origin;
    if (u.protocol !== 'https:' && !process.argv.includes('--allow-http')) throw new Error('HTTP needs --allow-http (not encrypted).');
    const hostname = u.hostname.toLowerCase();
    const internal = hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') ||
      hostname.endsWith('.internal') || /^(?:127|10|192\.168)\./.test(hostname) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname) || hostname === '[::1]';
    if (internal && !process.argv.includes('--allow-private')) throw new Error('Private/internal origins require --allow-private.');
    let db;
    try { db=JSON.parse(readFileSync(file,'utf8')); } catch { db={version:1,origins:{}}; }
    if (!db || db.version !== 1 || !db.origins || typeof db.origins !== 'object') db={version:1,origins:{}};
    if (action==='revoke') delete db.origins[origin];
    else if (action==='allow-once') db.origins[origin]={mode:'once',expiresAt:Date.now()+15*60*1000};
    else db.origins[origin]={mode:action};
    mkdirSync(join(file,'..'),{recursive:true,mode:0o700});
    writeFileSync(file,JSON.stringify(db,null,2)+'\n',{mode:0o600});
    console.log(`${origin}: ${action} recorded locally. Restart not required.`);
    if (action==='allow-once') console.log('One-time approval expires after 15 minutes if unused and is consumed on first navigation.');
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
