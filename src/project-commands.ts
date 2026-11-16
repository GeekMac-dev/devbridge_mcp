import { spawn } from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {activity} from './activity-log.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { safeProject } from './integrations.js';

export const TASKS = ['build','test','lint','typecheck','check','test:design','test:integrations','test:animation'] as const;
export type ProjectTask = typeof TASKS[number];

function within(base:string, target:string) {
  const rel=path.relative(base,target);
  return rel==='' || (rel!=='..' && !rel.startsWith('..'+path.sep) && !path.isAbsolute(rel));
}

export async function planProjectTask(projectPath:string, task:ProjectTask) {
  if(!TASKS.includes(task)) throw new Error('Unsupported project task');
  const project=await safeProject(projectPath);
  const realProject=await fs.realpath(project);
  if(realProject.toLowerCase()!==project.toLowerCase()) throw new Error('Project symlink or junction is blocked');
  const manifest=path.join(project,'package.json');
  const stat=await fs.lstat(manifest);
  if(!stat.isFile() || stat.isSymbolicLink()) throw new Error('Regular package.json required');
  const parsed=JSON.parse(await fs.readFile(manifest,'utf8')) as {scripts?:Record<string,unknown>};
  if(typeof parsed.scripts?.[task]!=='string') throw new Error('Task is not defined in package.json');
  return {project,task,script:parsed.scripts[task] as string};
}

export async function runProjectTask(projectPath:string,task:ProjectTask) {
  if(process.env.BRIDGE_PROJECT_COMMANDS_ENABLED!=='1') throw new Error('Project commands are disabled. Set BRIDGE_PROJECT_COMMANDS_ENABLED=1 in the local bridge environment.');
  const plan=await planProjectTask(projectPath,task);
  const maxChars=50000;
  const runId=randomUUID();
  await activity({id:runId,phase:'start',tool:'project_task_run',project:plan.project,action:task});
  return await new Promise(resolve=>{
    // npm.cmd is a Windows batch file, so invoke a fixed cmd.exe command.
    // No user-supplied shell text is interpolated: task comes from TASKS.
    const child=spawn(process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe',
      ['/d','/s','/c', 'npm run '+task],{
        cwd:plan.project,windowsHide:true,
        env:{...process.env,CI:'1',npm_config_yes:'false',GIT_TERMINAL_PROMPT:'0'},
        stdio:['ignore','pipe','pipe']
      });
    let stdout='',stderr='',truncated=false,timedOut=false;
    const add=(s:string,channel:'out'|'err')=>{
      if(channel==='out'){const left=maxChars-stdout.length;stdout+=s.slice(0,Math.max(0,left));truncated ||= s.length>left;}
      else {const left=maxChars-stderr.length;stderr+=s.slice(0,Math.max(0,left));truncated ||= s.length>left;}
      void activity({id:runId,phase:'output',tool:'project_task_run',project:plan.project,action:task,message:s.slice(0,1400)}).catch(()=>{});
    };
    child.stdout.on('data',(buf:Buffer)=>add(buf.toString('utf8'),'out'));
    child.stderr.on('data',(buf:Buffer)=>add(buf.toString('utf8'),'err'));
    const timeout=setTimeout(()=>{timedOut=true;child.kill();},120000);
    child.on('error',e=>{clearTimeout(timeout);void activity({id:runId,phase:'end',tool:'project_task_run',project:plan.project,action:task,ok:false,message:e.message}).catch(()=>{});resolve({ok:false,project:plan.project,task,error:e.message});});
    child.on('close',(code,signal)=>{clearTimeout(timeout);void activity({id:runId,phase:'end',tool:'project_task_run',project:plan.project,action:task,ok:code===0&&!timedOut,exitCode:code}).catch(()=>{});resolve({ok:code===0&&!timedOut,project:plan.project,task,exitCode:code,signal,timedOut,truncated,stdout,stderr});});
  });
}
