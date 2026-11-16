/**
 * Opt-in design references for the Codex Bridge.
 * No remote code execution, no automatic source changes, no brand asset copying.
 * Inspiration profiles are original summaries. Upstream DESIGN.md is linked, not mirrored.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const upstream='https://github.com/VoltAgent/awesome-design-md';
const profiles={
  linear:{name:'Linear',focus:'Enterprise workflows and dense dashboards',colors:'Neutral surfaces; restrained violet accents',type:'Clear compact type scale',components:'Compact tables, predictable actions, subtle dividers'},
  stripe:{name:'Stripe',focus:'Marketing pages and polished product storytelling',colors:'Measured violet and blue accents',type:'Expressive headings with readable body',components:'Generous hero sections, refined cards, clear CTAs'},
  vercel:{name:'Vercel',focus:'Developer tools and SaaS administration',colors:'Monochrome baseline and purposeful status colors',type:'Precise hierarchy and technical readability',components:'Simple navigation, high-contrast controls, compact cards'},
  sap:{name:'SAP',focus:'Enterprise ERP transactions',colors:'Accessible blue action color and neutral backgrounds',type:'Readable transactional density',components:'Data tables, consistent field labels, validation states'}
} as const;
export type DesignProfile=keyof typeof profiles;
export function listDesignProfiles(){
  return Object.entries(profiles).map(([id,p])=>({id,...p,source:upstream,sourceType:'inspiration; not a verbatim upstream DESIGN.md'}));
}
function validateRoot(input:string){
  if(!path.isAbsolute(input)) throw new Error('An absolute project directory is required');
  const root=path.resolve(input);
  if(/[\\/]\.(ssh|aws|azure)([\\/]|$)/i.test(root)) throw new Error('Sensitive directory is blocked');
  return root;
}
async function projectRoot(input:string){
  const root=validateRoot(input);
  const stat=await fs.stat(root);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Project directory must be a real directory');
  return root;
}
function approvedWrite(root:string){
  const allowed=(process.env.BRIDGE_WRITE_ROOTS||'D:\\').split(';').map(s=>path.resolve(s.trim())).filter(Boolean);
  if(!allowed.some(base=>{const relative=path.relative(base,root);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}))
    throw new Error('Project is outside BRIDGE_WRITE_ROOTS');
}
export async function inspectProjectDesign(input:string){
  const root=await projectRoot(input), file=path.join(root,'DESIGN.md');
  try{
    const stat=await fs.lstat(file);
    if(!stat.isFile())throw new Error('DESIGN.md is not a regular file');
    const markdown=await fs.readFile(file,'utf8');
    return {project:root,exists:true,file,markdown:markdown.slice(0,100000),truncated:markdown.length>100000};
  }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {project:root,exists:false,file};throw e;}
}
export async function createProjectDesign(input:string,profile:DesignProfile){
  const root=await projectRoot(input);
  approvedWrite(root);
  const p=profiles[profile];
  if(!p)throw new Error('Unknown design profile');
  const file=path.join(root,'DESIGN.md');
  const markdown=`# Project Design System

> Base inspiration: ${p.name} (${upstream}). This is an original, project-specific starting point, NOT a copy of the upstream brand design system.
> Preserve the project's current brand, styles, functional behavior, and accessibility. Do not perform a wholesale redesign without approval.

## Design direction
- Use case: ${p.focus}
- Palette direction: ${p.colors}
- Typography: ${p.type}
- Components: ${p.components}

## Project-first rules
- Inspect existing global tokens, components, and current screens before implementing UI changes.
- Prefer existing design tokens and shared components over new one-off styles.
- Use semantic foreground/background/status colors; maintain readable contrast.
- Provide keyboard support, clear focus indication, form errors, and responsive layouts.
- Keep tables, forms, dialogs, loading states, and empty states visually consistent.
- Preserve scanning autofocus, full-height scrolling, business logic, APIs, and navigation.
- Never replace working workflows just to imitate another product's appearance.
- Preview at mobile and desktop widths and review browser console errors after edits.

## Local design decisions
<!-- Add real tokens, spacing, type scale, and approved patterns from this project here. -->
`;
  const handle=await fs.open(file,'wx'); // never overwrite existing DESIGN.md
  try{await handle.writeFile(markdown,'utf8');}finally{await handle.close();}
  return {created:true,file,profile,source:upstream,note:'Template only. Review and adapt before making UI changes.'};
}
export async function auditProjectDesign(input:string){
  const root=await projectRoot(input);
  const dirs=['src','app','pages','components','templates','static'];
  const extensions=new Set(['.tsx','.jsx','.css','.scss','.html','.vue','.svelte']);
  const skip=new Set(['node_modules','.git','dist','build','.next','coverage','.venv','venv']);
  const found:string[]=[];
  const issues:{file:string;kind:string;count:number}[]=[];
  async function walk(dir:string,depth:number){
    if(depth>5||found.length>=180)return;
    let entries;
    try{entries=await fs.readdir(dir,{withFileTypes:true});}catch{return;}
    for(const e of entries){
      if(found.length>=180)break;
      if(e.isSymbolicLink())continue;
      const full=path.join(dir,e.name);
      if(e.isDirectory()){if(!skip.has(e.name))await walk(full,depth+1);continue;}
      if(!e.isFile()||!extensions.has(path.extname(e.name).toLowerCase()))continue;
      const st=await fs.stat(full);if(st.size>250000)continue;
      found.push(full);
      const source=await fs.readFile(full,'utf8');
      const checks:[string,RegExp][]=[
        ['hardcoded-hex-colors',/#[0-9a-f]{3,8}\b/gi],
        ['inline-style-props',/\bstyle\s*=\s*\{\{/g],
        ['fixed-pixel-width',/\bwidth\s*:\s*['"]?\d{3,}px/g],
        ['browser-alert',/\bwindow\.alert\s*\(/g]
      ];
      for(const [kind,pattern]of checks){const count=[...source.matchAll(pattern)].length;if(count)issues.push({file:path.relative(root,full),kind,count});}
    }
  }
  for(const dir of dirs)await walk(path.join(root,dir),0);
  const design=await inspectProjectDesign(root);
  return {project:root,filesScanned:found.length,limit:180,hasDesignMd:design.exists,findings:issues.sort((a,b)=>b.count-a.count).slice(0,100),note:'Heuristic read-only signals, not confirmed design defects. Review existing tokens and screenshots before modifying.'};
}
