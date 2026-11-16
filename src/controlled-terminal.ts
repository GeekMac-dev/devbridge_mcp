import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {safeProject} from './integrations.js';
import {activity} from './activity-log.js';

export const TERMINAL_ACTIONS=['git-status','git-diff','git-log','npm-build','npm-test','npm-lint','python-pytest','gradle-assemble-debug','powershell-script'] as const;
export type TerminalAction=typeof TERMINAL_ACTIONS[number];
const approvalRequired=new Set<TerminalAction>(['powershell-script']);
const isInside=(root:string,value:string)=>{
  const relative=path.relative(root,value);
  return relative!== '..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);
};
async function localScript(root:string,file:string){
  if(!/^[a-zA-Z0-9_.\\/-]+\.ps1$/.test(file) || path.isAbsolute(file) || file.includes('..')) throw new Error('Script must be a relative .ps1 file without traversal');
  const full=path.resolve(root,file);
  if(!isInside(root,full)) throw new Error('Script outside project');
  const stat=await fs.lstat(full);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Script must be an ordinary file');
  const real=await fs.realpath(full);
  if(!isInside(root,real))throw new Error('Script resolves outside project');
  return full;
}
export async function terminalPlan(projectPath:string,action:TerminalAction,script?:string){
  if(!TERMINAL_ACTIONS.includes(action))throw new Error('Unsupported terminal action');
  const project=await safeProject(projectPath);
  if(path.resolve(await fs.realpath(project)).toLowerCase()!==path.resolve(project).toLowerCase())throw new Error('Project link blocked');
  let executable:string;
  let args:string[];
  let cwd=project;
  switch(action){
    case 'git-status':executable='git';args=['status','--short','--branch'];break;
    case 'git-diff':executable='git';args=['diff','--stat'];break;
    case 'git-log':executable='git';args=['log','-5','--oneline'];break;
    case 'npm-build':case 'npm-test':case 'npm-lint':{
      const task=action.substring(4);
      const manifest=path.join(project,'package.json');
      const st=await fs.lstat(manifest);
      if(!st.isFile()||st.isSymbolicLink())throw new Error('Regular package.json required');
      const pkg=JSON.parse(await fs.readFile(manifest,'utf8')) as {scripts?:Record<string,string>};
      if(typeof pkg.scripts?.[task]!=='string')throw new Error('Task not present in package.json');
      // cmd is used only with a fixed, non-user-provided command.
      executable=process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe';
      args=['/d','/s','/c','npm run '+task];break;
    }
    case 'python-pytest':executable='python';args=['-m','pytest','-q'];break;
    case 'gradle-assemble-debug':{
      cwd=path.join(project,'android');
      const st=await fs.lstat(path.join(cwd,'gradlew.bat'));
      if(!st.isFile()||st.isSymbolicLink())throw new Error('android/gradlew.bat required');
      executable=process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe';
      args=['/d','/s','/c','gradlew.bat assembleDebug --no-daemon'];break;
    }
    case 'powershell-script':{
      if(!script)throw new Error('Script path required');
      const full=await localScript(project,script);
      executable='powershell.exe';args=['-NoProfile','-NonInteractive','-ExecutionPolicy','RemoteSigned','-File',full];break;
    }
  }
  return {project,cwd,action,executable,args,requiresApproval:approvalRequired.has(action)};
}
export async function terminalRun(projectPath:string,action:TerminalAction,script?:string,confirm=false){
  if(process.env.BRIDGE_TERMINAL_ENABLED!=='1')throw new Error('Terminal disabled: set BRIDGE_TERMINAL_ENABLED=1 locally');
  const plan=await terminalPlan(projectPath,action,script);
  if(plan.requiresApproval && (!confirm||process.env.BRIDGE_TERMINAL_SCRIPTS_ENABLED!=='1'))throw new Error('PowerShell scripts require confirm=true and BRIDGE_TERMINAL_SCRIPTS_ENABLED=1');
  const runId = randomUUID();
  await activity({id:runId,phase:'start',tool:'terminal_run',project:plan.project,action});
  return new Promise(resolve=>{
    const child=spawn(plan.executable,plan.args,{
      cwd:plan.cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],
      env:{...process.env,CI:'1',GIT_TERMINAL_PROMPT:'0',npm_config_yes:'false'}
    });
    let stdout='',stderr='',truncated=false,timedOut=false;
    const add=(chunk:Buffer,which:'stdout'|'stderr')=>{
      const text=chunk.toString('utf8');const before=which==='stdout'?stdout:stderr;
      const remain=Math.max(0,40000-before.length);
      if(which==='stdout')stdout+=text.slice(0,remain);else stderr+=text.slice(0,remain);
      if(text.length>remain)truncated=true;
      void activity({id:runId,phase:'output',tool:'terminal_run',project:plan.project,action,message:text.slice(0,1400)}).catch(()=>{});
    };
    child.stdout.on('data',(x:Buffer)=>add(x,'stdout'));
    child.stderr.on('data',(x:Buffer)=>add(x,'stderr'));
    let finished=false;
    const done=(result:object)=>{if(finished)return;finished=true;clearTimeout(timer);
      const r=result as {ok?:boolean;exitCode?:number|null};
      void activity({id:runId,phase:'end',tool:'terminal_run',project:plan.project,action,ok:r.ok??false,exitCode:r.exitCode}).catch(()=>{});
      resolve(result);};
    const timer=setTimeout(()=>{timedOut=true;child.kill();},120000);
    child.on('error',(e)=>done({ok:false,action,error:e.message}));
    child.on('close',(exitCode,signal)=>done({ok:exitCode===0&&!timedOut,action,project:plan.project,exitCode,signal,timedOut,truncated,stdout,stderr}));
  });
}
