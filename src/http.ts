import express, { type Request, type Response, type NextFunction } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';
import { detectCodexHome } from './paths.js';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';


const host=process.env.HOST || '127.0.0.1';
const port=Number.parseInt(process.env.SQL_BRIDGE_PORT || '8788',10);
const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'2mb'}));
app.use((_req:Request,res:Response,next:NextFunction)=>{res.setHeader('Cache-Control','no-store');next();});

app.get('/health',(_req,res)=>res.json({
  ok:true,service:'devbridge-mcp',version:'1.0.0',transport:'streamable-http',

  codexHome:detectCodexHome(),browserEnabled:process.env.BRIDGE_BROWSER_ENABLED==='1',mode:'Codex history, local code editing, Git, terminal, browser and design'
}));



// All MCP tools require a local bearer token by default.
// Existing tunnel launcher already supplies Authorization headers.
app.use('/mcp',(req,res,next)=>{
  if(process.env.BRIDGE_MCP_ALLOW_UNAUTHENTICATED_LOCAL==='1' && host==='127.0.0.1')return next();
  try{
    const file=process.env.MACBRIDGE_MCP_TOKEN_FILE;
    if(!file)throw new Error('Missing MCP token file setting');
    const expected=Buffer.from(readFileSync(file,'utf8').trim(),'utf8');
    const received=Buffer.from((req.headers.authorization||'').replace(/^Bearer /i,'').trim(),'utf8');
    if(expected.length<32 || expected.length!==received.length || !timingSafeEqual(expected,received)){
      res.status(401).json({error:'Unauthorized'});return;
    }
    next();
  }catch{
    res.status(503).json({error:'WSL gateway authentication unavailable'});
  }
});
app.all('/mcp',async(req,res)=>{
  const server=createMcpServer();
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  let closed=false;
  const close=async()=>{if(closed)return;closed=true;try{await transport.close();}catch{} try{await server.close();}catch{}};
  res.on('close',()=>{void close();});
  try{
    await server.connect(transport);
    await transport.handleRequest(req,res,req.body);
  }catch(error){
    console.error('[MCP HTTP] request failed:',error);
    if(!res.headersSent)res.status(500).json({jsonrpc:'2.0',error:{code:-32603,message:'Internal server error'},id:null});
    await close();
  }
});
app.use((
  err: Error & { status?: number; type?: string },
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (res.headersSent) return;

  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON request body' });
    return;
  }

  console.error('[HTTP] Request failed:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});
app.use((_req,res)=>res.status(404).json({error:'Not found'}));
app.listen(port,host,()=>{
  console.log('DevBridge MCP v1.0.0');
  console.log(`Health : http://${host}:${port}/health`);
  console.log(`MCP    : http://${host}:${port}/mcp`);
  console.log('Tools  : programming-focused MCP tools (browser opt-in)');
  console.log('Browser : opt-in Playwright, restricted to allowlisted dev origins');
});
