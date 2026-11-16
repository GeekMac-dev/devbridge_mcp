import http from 'node:http';
import {recentActivity,activityLogPath} from './activity-log.js';
const host='127.0.0.1';
const port=Number(process.env.BRIDGE_ACTIVITY_PORT||8792);
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Codex Bridge Activity</title><style>
:root{color-scheme:dark;font:14px system-ui,sans-serif;background:#0c1220;color:#e5e9f0}*{box-sizing:border-box}body{margin:0;padding:30px;max-width:1150px;margin-inline:auto}h1{font-size:24px;margin:0 0 8px}.sub{color:#9ba6b8;margin-bottom:24px}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.dot{width:9px;height:9px;border-radius:50%;background:#65d69a;display:inline-block;margin-right:8px}.item{background:#172236;border:1px solid #2e3a50;border-radius:10px;margin:12px 0;padding:16px}.row{display:flex;justify-content:space-between;gap:16px;align-items:center}.name{font-weight:700;font-size:16px}.meta{color:#aab6c8;overflow-wrap:anywhere;margin-top:7px}.status{font-weight:700}.pass{color:#73dfa8}.fail{color:#ff8585}.running{color:#eac675}pre{background:#080d17;color:#c9d7eb;padding:12px;border-radius:7px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;font:12px Consolas,monospace}button{background:#25354e;color:white;border:1px solid #415674;border-radius:6px;padding:8px 12px;cursor:pointer}.empty{padding:60px;text-align:center;color:#aab6c8}</style></head><body>
<div class="top"><div><h1>Codex Bridge · Live Activity</h1><div class="sub"><span class="dot"></span>Local-only viewer · refreshes every 1.5 seconds</div></div><button onclick="load()">Refresh</button></div>
<div id="list" aria-live="polite" class="empty">Waiting for activity…</div>
<script>
const list=document.getElementById('list');let lastSnapshot='';let loading=false;const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
async function load(){if(loading)return;loading=true;try{const response=await fetch('/api/activity',{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);const events=await response.json();const snapshot=JSON.stringify(events);if(snapshot===lastSnapshot)return;lastSnapshot=snapshot;const previousScroll=window.scrollY;const previousPreScroll=Array.from(list.querySelectorAll('pre')).map(node=>node.scrollTop);const runs=new Map();
for(const evt of events){let r=runs.get(evt.id);if(!r){r={...evt,lines:[],phase:'start'};runs.set(evt.id,r);}r.phase=evt.phase;if(evt.phase==='output'&&evt.message)r.lines.push(evt.message);if(evt.phase==='end'){r.ok=evt.ok;r.exitCode=evt.exitCode;}}
list.replaceChildren();if(!runs.size){list.className='empty';list.textContent='No commands recorded yet. Run a build or Git command through the bridge.';return;}list.className='';
for(const r of Array.from(runs.values()).reverse().slice(0,40)){const card=el('section','item');const row=el('div','row');row.append(el('div','name',r.action));const label=r.phase==='end'?(r.ok?'Passed':'Failed'):'Running';row.append(el('div','status '+(r.phase==='end'?(r.ok?'pass':'fail'):'running'),label));card.append(row);card.append(el('div','meta',r.project+' · '+new Date(r.at).toLocaleString()+' · '+r.tool));if(r.lines.length)card.append(el('pre','',r.lines.join('').slice(-12000)));if(r.phase==='end')card.append(el('div','meta','Exit code: '+(r.exitCode??'unknown')));list.append(card);}
Array.from(list.querySelectorAll('pre')).forEach((node,index)=>{node.scrollTop=previousPreScroll[index]||0;});
window.scrollTo(0,previousScroll);
}catch(e){list.className='empty';list.textContent='Unable to load activity: '+String(e);}finally{loading=false;}}
load();setInterval(load,1500);
</script></body></html>`;
http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'");
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
  if(req.url==='/api/status'){const events=await recentActivity(400);res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({ok:true,eventCount:events.length,logPath:activityLogPath(),note:'The Codex Bridge process must also be restarted after installing activity logging.'}));return;}
  if(req.url==='/api/activity'){try{const data=await recentActivity(400);res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));}catch{res.writeHead(500);res.end('[]');}return;}
  res.writeHead(404);res.end('Not found');
}).listen(port,host,()=>console.log('Codex Bridge Activity Viewer: http://'+host+':'+port));
