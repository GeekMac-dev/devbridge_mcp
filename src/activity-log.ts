import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

export type ActivityEvent={id:string;at:string;phase:'start'|'output'|'end';tool:string;project:string;action:string;message?:string;ok?:boolean;exitCode?:number|null};
const logPath=()=>path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','data','activity.jsonl');
export function activityLogPath(){return logPath();}
const compact=(v:string)=>v.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').slice(0,3000);
export async function activity(event:Omit<ActivityEvent,'at'|'id'> & {id?:string}){
  if(process.env.BRIDGE_ACTIVITY_ENABLED==='0')return;
  const payload:ActivityEvent={...event,id:event.id||randomUUID(),at:new Date().toISOString(),message:event.message?compact(event.message):undefined};
  await fs.mkdir(path.dirname(logPath()),{recursive:true});
  await fs.appendFile(logPath(),JSON.stringify(payload)+'\n',{encoding:'utf8',mode:0o600});
}
export async function recentActivity(limit=120):Promise<ActivityEvent[]>{
  try{
    const stat=await fs.stat(logPath());
    const handle=await fs.open(logPath(),'r');
    try{
      const size=Math.min(stat.size,512*1024);
      const buffer=Buffer.alloc(size);
      await handle.read(buffer,0,size,stat.size-size);
      const lines=buffer.toString('utf8').split('\n');
      if(stat.size>size)lines.shift();
      return lines.filter(Boolean).slice(-Math.max(1,Math.min(limit,500))).flatMap(line=>{
        try{return [JSON.parse(line) as ActivityEvent];}catch{return [];}
      });
    }finally{await handle.close();}
  }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
}
