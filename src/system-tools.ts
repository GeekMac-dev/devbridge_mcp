

import fs from 'node:fs/promises';
import path from 'node:path';






// Local Disk tools.
// Read/search/write/patch are allowed on all mounted local drives.
// Critical credential/security locations remain blocked.
const BLOCKED_FILE_NAMES = new Set([
  'ntuser.dat','sam','security','system','login data','cookies','web data',
  'id_rsa','id_ed25519'
]);
const BLOCKED_EXTENSIONS = new Set(['.pfx','.p12','.key']);
const BLOCKED_PATH_PARTS = [
  '\\windows\\system32\\config\\',
  '\\.ssh\\','\\.aws\\','\\.azure\\',
  '\\google\\chrome\\user data\\',
  '\\microsoft\\edge\\user data\\',
  '\\mozilla\\firefox\\profiles\\'
];

function safeDiskPath(input:string){
  if(!input?.trim()) throw new Error('Path is required');
  const full=path.resolve(input);
  const low=full.toLowerCase();
  const base=path.basename(full).toLowerCase();

  if(BLOCKED_FILE_NAMES.has(base) ||
     BLOCKED_EXTENSIONS.has(path.extname(base).toLowerCase()) ||
     BLOCKED_PATH_PARTS.some(x=>low.includes(x))){
    throw new Error('Sensitive credential/system path is blocked');
  }
  return full;
}

// Write access now uses the same all-drive path policy as read access.
function writableDiskPath(input:string){
  const full=safeDiskPath(input);
  const roots=(process.env.BRIDGE_WRITE_ROOTS || 'D:\\').split(';').map(x=>path.resolve(x.trim()).toLowerCase()).filter(Boolean);
  if (!roots.some(root => {
  const relative = path.relative(root, full).toLowerCase();
  return relative === '' ||
    (relative !== '..' &&
     !relative.startsWith('..' + path.sep) &&
     !path.isAbsolute(relative));
})) {
  throw new Error('Write blocked: path is outside BRIDGE_WRITE_ROOTS');
}
  return full;
}

export async function listDrives(){
  const drives:string[]=[];
  for(const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){
    const root=`${letter}:\\`;
    try { if((await fs.stat(root)).isDirectory()) drives.push(root); } catch {}
  }
  return drives;
}

export async function listDirectory(input:string,limit=500){
  const full=safeDiskPath(input);
  const rows=await fs.readdir(full,{withFileTypes:true});
  return rows.slice(0,limit).map(e=>({
    name:e.name,
    type:e.isDirectory()?'directory':e.isFile()?'file':'other',
    path:path.join(full,e.name)
  }));
}

export async function readFile(input:string,maxChars=100000){
  const full=safeDiskPath(input);
  const st=await fs.stat(full);
  if(!st.isFile()) throw new Error('Path is not a file');
  if(st.size>10*1024*1024) throw new Error('File exceeds 10 MB read limit');
  const b=await fs.readFile(full);
  if(b.includes(0)) throw new Error('Binary file reading is blocked');
  return b.toString('utf8').slice(0,maxChars);
}

export async function fileInfo(input:string){
  const full=safeDiskPath(input);
  const st=await fs.stat(full);
  return {
    path:full,
    size:st.size,
    isFile:st.isFile(),
    isDirectory:st.isDirectory(),
    created:st.birthtime,
    modified:st.mtime
  };
}

export async function searchFiles(root:string,query:string,limit=100){
  const base=safeDiskPath(root);
  const wanted=query.toLowerCase();
  const hits:any[]=[];

  async function walk(dir:string){
    if(hits.length>=limit) return;
    let entries;
    try { entries=await fs.readdir(safeDiskPath(dir),{withFileTypes:true}); } catch { return; }

    for(const e of entries){
      if(hits.length>=limit) return;
      const full=path.join(dir,e.name);

      try{
        safeDiskPath(full);

        if(e.isDirectory()){
          await walk(full);
          continue;
        }

        if(!e.isFile()) continue;

        const st=await fs.stat(full);
        if(st.size>2*1024*1024) continue;

        const b=await fs.readFile(full);
        if(b.includes(0)) continue;

        const text=b.toString('utf8');
        const idx=text.toLowerCase().indexOf(wanted);

        if(idx>=0){
          hits.push({
            path:full,
            match:text.slice(
              Math.max(0,idx-120),
              Math.min(text.length,idx+wanted.length+120)
            )
          });
        }
      }catch{}
    }
  }

  await walk(base);
  return hits;
}

export async function writeFile(input:string,content:string){
  const full=writableDiskPath(input);
  await fs.mkdir(path.dirname(full),{recursive:true});
  await fs.writeFile(full,content,'utf8');
  return {ok:true,path:full,chars:content.length};
}

export async function patchFile(input:string,search:string,replace:string,replaceAll=false){
  const full=writableDiskPath(input);
  const original=await fs.readFile(full,'utf8');

  if(!original.includes(search)) throw new Error('Search text was not found');

  const replacements=replaceAll ? original.split(search).length-1 : 1;
  const updated=replaceAll
    ? original.split(search).join(replace)
    : original.replace(search,replace);

  await fs.writeFile(full,updated,'utf8');
  return {ok:true,path:full,replacements};
}
