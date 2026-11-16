import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { scanCodexHistory } from './indexer.js';
import { searchHistory, latestSessions, getSession } from './search.js';
import { detectCodexHome } from './paths.js';
import * as tools from './system-tools.js';

import * as browserTools from './browser-tools.js';
import * as design from './design-manager.js';
import * as integrations from './integrations.js';
import * as projectCommands from './project-commands.js';
import * as terminal from './controlled-terminal.js';

import * as designLibrary from './design-library.js';










const txt=(v:unknown)=>({content:[{type:'text' as const,text:typeof v==='string'?v:JSON.stringify(v,null,2)}]});
const ro={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};

export function createMcpServer(){
  const s=new McpServer({name:'devbridge-mcp',version:'1.0.0'});

  // Original 5 Codex tools
  s.tool('scan_codex_history','Scan local Codex session files into the local search index.',{}, {readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},async()=>txt(await scanCodexHistory()));
  s.tool('search_codex_history','Search indexed Codex conversations.',{query:z.string().min(1),limit:z.number().int().min(1).max(100).default(20)},ro,async({query,limit})=>txt(searchHistory(query,limit)));
  s.tool('latest_codex_sessions','Return recent Codex sessions.',{limit:z.number().int().min(1).max(100).default(10)},ro,async({limit})=>txt(latestSessions(limit)));
  s.tool('get_codex_session','Return messages from one Codex session.',{session_id:z.string(),limit:z.number().int().min(1).max(1000).default(200)},ro,async({session_id,limit})=>txt(getSession(session_id,limit)));
  s.tool('codex_storage_info','Show detected Codex storage.',{},ro,async()=>txt({codexHome:detectCodexHome()}));


  // Local Disk tools: 5 read-only + 2 controlled editing tools
  s.tool('list_drives','List readable local Windows drives.',{},ro,async()=>txt(await tools.listDrives()));
  s.tool('list_directory','List entries in an absolute local directory.',{path:z.string().min(1),limit:z.number().int().min(1).max(2000).default(500)},ro,async(a)=>txt(await tools.listDirectory(a.path,a.limit)));
  s.tool('read_file','Read a local text file by absolute path.',{path:z.string().min(1),max_chars:z.number().int().min(1).max(250000).default(100000)},ro,async(a)=>txt(await tools.readFile(a.path,a.max_chars)));
  s.tool('file_info','Read metadata for an absolute local path.',{path:z.string().min(1)},ro,async(a)=>txt(await tools.fileInfo(a.path)));
  s.tool('search_files','Search text recursively from an absolute local directory.',{root:z.string().min(1),query:z.string().min(1),limit:z.number().int().min(1).max(500).default(100)},ro,async(a)=>txt(await tools.searchFiles(a.root,a.query,a.limit)));
  s.tool('write_file','Create or replace a UTF-8 text file inside an allowlisted development folder.',{path:z.string().min(1),content:z.string().max(2000000)},{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false},async(a)=>txt(await tools.writeFile(a.path,a.content)));
  s.tool('patch_file','Replace exact text inside a UTF-8 file in an allowlisted development folder.',{path:z.string().min(1),search:z.string().min(1),replace:z.string(),replace_all:z.boolean().default(false)},{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false},async(a)=>txt(await tools.patchFile(a.path,a.search,a.replace,a.replace_all)));

  // Opt-in Playwright browser testing. Actions require explicit confirmation and an allowed origin.
  s.tool('browser_status','Check the opt-in Playwright browser configuration.',{},ro,async()=>txt(browserTools.browserStatus()));
  s.tool('browser_open','Open an approved HTTP(S) site in the dedicated Chrome profile; otherwise return local PowerShell approval instructions. Never self-approves websites.',{url:z.string().url()},ro,async(a)=>txt(await browserTools.browserOpen(a.url)));
  s.tool('browser_snapshot','Read the current browser page title, URL, and visible text.',{},ro,async()=>txt(await browserTools.browserSnapshot()));
  s.tool('browser_screenshot','Capture a viewport screenshot (may contain private ERPNext data).',{},ro,async()=>{
    const data=await browserTools.browserScreenshot();
    return {content:[{type:'image' as const,data:data.toString('base64'),mimeType:'image/png'}]};
  });
  s.tool('browser_click','Click an exact locator. Can change ERP data; requires explicit authorization and confirm=true.',{
    kind:z.enum(['role','text','css']),target:z.string().min(1),role:z.string().optional(),confirm:z.boolean().default(false)
  },{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false},async(a)=>txt(await browserTools.browserClick(a.kind,a.target,a.role,a.confirm)));
  s.tool('browser_fill','Fill one exact locator. May trigger autosave; requires explicit authorization and confirm=true.',{
    kind:z.enum(['role','text','css']),target:z.string().min(1),role:z.string().optional(),value:z.string(),confirm:z.boolean().default(false)
  },{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false},async(a)=>txt(await browserTools.browserFill(a.kind,a.target,a.role,a.value,a.confirm)));
  s.tool('browser_source_probe','Reload the authenticated development page and inspect only invalid resource references in the original HTML; excludes boot data.',{},ro,async()=>txt(await browserTools.browserSourceProbe()));
  s.tool('browser_diagnostics','Inspect recent browser console errors, uncaught exceptions, HTTP errors and failed requests. Optional clear resets diagnostic history.',{clear:z.boolean().default(false)},ro,async(a)=>txt(await browserTools.browserDiagnostics(a.clear)));
  s.tool('browser_close','Close the dedicated Playwright browser session.',{}, {readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},async()=>txt(await browserTools.browserClose()));

  // Controlled, project-scoped terminal: fixed operations with local opt-in and explicit script gate.
  s.tool('terminal_plan','Plan a supported development command without executing it.',{
    project_path:z.string().min(1),action:z.enum(terminal.TERMINAL_ACTIONS),script:z.string().optional()
  },ro,async(a)=>txt(await terminal.terminalPlan(a.project_path,a.action,a.script)));
  s.tool('terminal_run','Execute a controlled project command. PowerShell scripts need separate local opt-in and explicit confirmation.',{
    project_path:z.string().min(1),action:z.enum(terminal.TERMINAL_ACTIONS),script:z.string().optional(),confirm:z.boolean().default(false)
  },{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false},
    async(a)=>txt(await terminal.terminalRun(a.project_path,a.action,a.script,a.confirm)));

  // Project-scoped development tasks. Opt-in locally; no arbitrary shell tool.
  s.tool('project_task_plan','Inspect a defined npm build/test/lint task without executing it.',{
    project_path:z.string().min(1),task:z.enum(projectCommands.TASKS)
  },ro,async(a)=>txt(await projectCommands.planProjectTask(a.project_path,a.task)));
  s.tool('project_task_run','Run a predefined npm build/test/lint task in an approved local project and return the exit code and logs. Requires BRIDGE_PROJECT_COMMANDS_ENABLED=1.',{
    project_path:z.string().min(1),task:z.enum(projectCommands.TASKS)
  },{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false},
    async(a)=>txt(await projectCommands.runProjectTask(a.project_path,a.task)));

  // Optional read-only coding integrations. All source modifications remain controlled by existing tools.
  s.tool('integration_catalog','List available and pending development-tool integrations.',{},ro,async()=>txt(integrations.integrationCatalog()));
  s.tool('git_inspect','Read local repository status and diff statistics (never stages or commits).',{project_path:z.string().min(1)},ro,async(a)=>txt(await integrations.gitInspect(a.project_path)));
  s.tool('semgrep_scan','Opt-in Semgrep static security scan; requires local Semgrep CLI and BRIDGE_SEMGREP_ENABLED=1.',{project_path:z.string().min(1)},ro,async(a)=>txt(await integrations.semgrepScan(a.project_path)));
  s.tool('browser_accessibility_basic','Read-only heuristic accessibility checks in the current approved browser page; not a complete axe-core audit.',{},ro,async()=>txt(await browserTools.browserBasicAccessibility()));
  s.tool('browser_performance','Read-only browser timing and slow resource summary of the current approved page.',{},ro,async()=>txt(await browserTools.browserPerformance()));

  s.tool('context7_docs','Opt-in read-only Context7 documentation lookup using a fixed HTTPS endpoint; never sends project files.',{library_id:z.string().min(1).max(160),query:z.string().min(1).max(500)}, {readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true},async(a)=>txt(await integrations.context7Docs(a.library_id,a.query)));
  s.tool('browser_axe_audit','Run installed axe-core WCAG audit on the current locally approved browser page (read-only).',{},ro,async()=>txt(await browserTools.browserAxeAudit()));

  // Project-scoped UI design references. Existing browser and project tools are unchanged.
  s.tool('design_profiles','Browse original design-inspiration profiles based on awesome-design-md.',{},ro,async()=>txt(design.listDesignProfiles()));
  s.tool('design_read',"Read a project's DESIGN.md without modifying it.",{project_path:z.string().min(1)},ro,async(a)=>txt(await design.inspectProjectDesign(a.project_path)));
  s.tool('design_initialize','Create a project DESIGN.md from an inspiration profile, only if absent. Never overwrites.',{
    project_path:z.string().min(1),profile:z.enum(['linear','stripe','vercel','sap'])
  },{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false},async(a)=>txt(await design.createProjectDesign(a.project_path,a.profile)));
  s.tool('design_audit','Read-only scan for potential UI consistency issues; does not alter project files.',{
    project_path:z.string().min(1)
  },ro,async(a)=>txt(await design.auditProjectDesign(a.project_path)));

  // Complete upstream catalog of version-pinned Awesome DESIGN.md references.
  // All remote content is treated as untrusted design data, never executed.
  s.tool('design_library_catalog','Discover every current upstream Awesome DESIGN.md reference (refresh optional).',{
    query:z.string().default(''),refresh:z.boolean().default(false)
  },ro,async(a)=>txt(await designLibrary.catalogDesigns(a.refresh,a.query)));
  s.tool('design_library_read','Read a full version-pinned upstream DESIGN.md by catalog ID.',{
    id:z.string().min(1),refresh:z.boolean().default(false)
  },ro,async(a)=>txt(await designLibrary.readUpstreamDesign(a.id,a.refresh)));
  s.tool('design_library_import','Save an upstream design reference in .design-references without overwriting the approved DESIGN.md.',{
    project_path:z.string().min(1),id:z.string().min(1)
  },{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true},
    async(a)=>txt(await designLibrary.importUpstreamDesign(a.project_path,a.id)));
  s.tool('design_library_guidance','Produce a project-aware design implementation plan using the full reference and current project audit. No source edits.',{
    project_path:z.string().min(1),id:z.string().min(1)
  },ro,async(a)=>txt(await designLibrary.designGuidance(a.project_path,a.id)));

  return s;
}
