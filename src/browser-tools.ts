import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { normalizeOrigin, getApproval, acquireOrigin, approvalStatus, clearSessionOrigins } from './browser-permissions.js';

let browser: Browser | undefined;
let context: BrowserContext | undefined;
let page: Page | undefined;
type DiagnosticEvent = { at: string; type: string; message: string; url?: string; status?: number };
const events: DiagnosticEvent[] = [];
const MAX_EVENTS = 150;
const safeUrl = (value: string): string => {
  try { const u = new URL(value); return u.origin + u.pathname.slice(0, 180); }
  catch { return '[unavailable]'; }
};
function record(type: string, message: string, url?: string, status?: number) {
  events.push({ at: new Date().toISOString(), type, message: message.slice(0, 400), ...(url ? { url: safeUrl(url) } : {}), ...(status === undefined ? {} : { status }) });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}
function attachDiagnostics(p: Page) {
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) record('console_' + m.type(), m.text()); });
  p.on('pageerror', e => record('page_error', e.message));
  p.on('requestfailed', req => record('request_failed', req.failure()?.errorText || 'Request failed', req.url()));
  p.on('response', res => {
    if (res.status() >= 400) record('http_error', res.statusText() || 'HTTP error', res.url(), res.status());
  });
  p.on('crash', () => record('page_crash', 'Page crashed'));
}
const allowed = approvalStatus().configuredOrigins;
const realtimeOrigin = new URL(process.env.BRIDGE_BROWSER_REALTIME_ORIGIN || 'http://erp.example.local:9000').origin;
const enabled = () => process.env.BRIDGE_BROWSER_ENABLED === '1';
const browserMode = () => process.env.BRIDGE_BROWSER_MODE === 'chrome-cdp' ? 'chrome-cdp' : 'chromium';
const chromeCdpUrl = 'http://127.0.0.1:9223'; // Deliberately fixed to loopback; never accept arbitrary remote CDP endpoints.

function allowedResource(value: string): boolean {
  try {
    const u = new URL(value);
    if (getApproval(u.origin) === 'allowed') return true;
    return ['http:', 'https:'].includes(u.protocol) &&
      !u.username && !u.password && u.origin === realtimeOrigin &&
      (u.pathname === '/socket.io/' || u.pathname === '/socket.io');
  } catch { return false; }
}

function requireEnabled() {
  if (!enabled()) throw new Error('Browser tools are disabled. Set BRIDGE_BROWSER_ENABLED=1 after configuring MCP authentication.');
}
function checkUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || getApproval(url.origin) !== 'allowed')
    throw new Error('Navigation blocked: website is not locally approved. Use browser-permissions.mjs to approve it first.');
  return url.toString();
}
async function getPage(): Promise<Page> {
  requireEnabled();
  if (page && !page.isClosed()) return page;
  if (browserMode() === 'chrome-cdp') {
    // Attach only to a Chrome instance launched with the dedicated ERP testing profile.
    try {
      browser = await chromium.connectOverCDP(chromeCdpUrl, { timeout: 10000 });
    } catch {
      throw new Error('Dedicated Chrome is not reachable at 127.0.0.1:9223. Run scripts/start-erp-chrome.ps1 first. No fallback to a personal Chrome profile.');
    }
    context = browser.contexts()[0];
    if (!context) throw new Error('Chrome CDP has no browser context.');
  } else {
    browser = await chromium.launch({ headless: process.env.BRIDGE_BROWSER_HEADLESS !== '0' });
    context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
  }
  await context.route('**/*', async route => {
    try {
      if (!allowedResource(route.request().url())) throw new Error('Resource origin blocked');
      await route.continue();
    } catch {
      await route.abort('blockedbyclient');
    }
  });
  // Inject a literal browser script to avoid transpiler helper references (__name).
  await context.addInitScript({content: `
    (() => {
      const records = [];
      Object.defineProperty(window, '__bridgeBadImages', {value: records, configurable: false});
      const inspect = node => {
        const nodes = node.matches('img') ? [node] : Array.from(node.querySelectorAll('img'));
        for (const element of nodes) {
          const src = element.getAttribute('src') || '';
          if (!['undefined','/undefined','null','/null'].includes(src.trim().toLowerCase())) continue;
          if (records.length >= 30) continue;
          const parent = element.parentElement;
          records.push({
            tag: 'img',
            src: src.slice(0,40),
            parentTag: (parent?.tagName || '').toLowerCase(),
            parentClass: typeof parent?.className === 'string' ? parent.className.slice(0,110) : '',
            label: (element.getAttribute('alt') || parent?.getAttribute('data-id') || '').slice(0,80)
          });
        }
      };
      const begin = () => {
        const observer = new MutationObserver(changes => {
          for (const change of changes) {
            if (change.type === 'attributes' && change.target instanceof Element) inspect(change.target);
            for (const node of change.addedNodes) if (node instanceof Element) inspect(node);
          }
        });
        observer.observe(document.documentElement, {subtree:true, childList:true, attributes:true, attributeFilter:['src']});
        inspect(document.documentElement);
      };
      if (document.documentElement) begin();
      else document.addEventListener('DOMContentLoaded', begin, {once:true});
    })();
  `});
  page = await context.newPage();
  attachDiagnostics(page);
  // DevTools identifies the script stack responsible for a failed request.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (event) => {
    try {
      const url = new URL(event.request.url);
      if (getApproval(url.origin) !== 'allowed' || !/\/undefined(?:$|\/)/.test(url.pathname)) return;
      const frames = event.initiator.stack?.callFrames || [];
      record('request_initiator', JSON.stringify({
        initiatorType: event.initiator.type,
        resourceType: event.type || null,
        requestOrigin: safeUrl(event.documentURL || ''),
        parserSource: event.initiator.url ? safeUrl(event.initiator.url) : null,
        parserLine: event.initiator.lineNumber ?? null,
        frames: frames.slice(0, 8).map(f => ({
          functionName: f.functionName,
          script: safeUrl(f.url),
          line: f.lineNumber + 1,
          column: f.columnNumber + 1
        }))
      }), event.request.url);
    } catch { /* Diagnostic collector must not interrupt browsing. */ }
  });
  page.on('dialog', dialog => { void dialog.dismiss(); });
  return page;
}
function summary(p: Page) {
  return { url: p.url(), title: p.url() === 'about:blank' ? '' : undefined };
}
function locator(p: Page, kind: 'role'|'text'|'css', target: string, role?: string) {
  if (target.length > 240 || !target.trim()) throw new Error('Invalid locator.');
  if (kind === 'role') {
    if (!role || !['button','link','textbox','checkbox','tab','menuitem','option'].includes(role)) throw new Error('Unsupported role.');
    return p.getByRole(role as 'button', { name: target, exact: true });
  }
  return kind === 'text' ? p.getByText(target, { exact: true }) : p.locator(target);
}
export function browserStatus() {
  return { enabled: enabled(), mode: browserMode(), cdpEndpoint: browserMode() === 'chrome-cdp' ? chromeCdpUrl : null, approvals: approvalStatus(), realtimeOrigin, started: !!page && !page.isClosed(), headless: browserMode() === 'chrome-cdp' ? false : process.env.BRIDGE_BROWSER_HEADLESS !== '0' };
}
export async function browserOpen(url: string) {
  requireEnabled();
  const origin = normalizeOrigin(url);
  const status = getApproval(origin);
  if (status !== 'allowed' && !acquireOrigin(origin))
    return { approvalRequired: true, origin, status, note: 'On the Windows host run: node scripts/browser-permissions.mjs allow-once ' + origin + ' (or always / deny). HTTPS public origins are supported by default; internal sites require --allow-private and HTTP also --allow-http. Approval must be performed locally by the user.' };
  const p = await getPage();
  await p.goto(checkUrl(url), { waitUntil: 'domcontentloaded', timeout: 20000 });
  checkUrl(p.url());
  return { ...summary(p), title: await p.title(), snapshot: (await p.locator('body').innerText({timeout:10000})).slice(0,12000) };
}
export async function browserSnapshot() {
  const p = await getPage();
  if (p.url() !== 'about:blank') checkUrl(p.url());
  return { ...summary(p), title: await p.title(), snapshot: (await p.locator('body').innerText({timeout:10000})).slice(0,16000) };
}
export async function browserClick(kind: 'role'|'text'|'css', target: string, role: string|undefined, confirm: boolean) {
  if (!confirm) throw new Error('Browser click can change ERP records; confirm=true and explicit user approval required.');
  const p = await getPage();
  if (p.url() !== 'about:blank') checkUrl(p.url());
  const el = locator(p, kind, target, role);
  if (await el.count() !== 1) throw new Error('Locator must match exactly one element.');
  await el.click({ timeout: 10000 });
  if (p.url() !== 'about:blank') checkUrl(p.url());
  return browserSnapshot();
}
export async function browserFill(kind: 'role'|'text'|'css', target: string, role: string|undefined, value: string, confirm: boolean) {
  if (!confirm) throw new Error('Filling forms may cause autosave; confirm=true and explicit user approval required.');
  if (value.length > 10000) throw new Error('Input too long.');
  const p = await getPage();
  if (p.url() !== 'about:blank') checkUrl(p.url());
  const el = locator(p,kind,target,role);
  if (await el.count() !== 1) throw new Error('Locator must match exactly one element.');
  await el.fill(value,{timeout:10000});
  if (p.url() !== 'about:blank') checkUrl(p.url());
  return {ok:true,url:safeUrl(p.url()),note:'Value not echoed to avoid exposing secrets.'};
}
export async function browserScreenshot() {
  const p = await getPage();
  if (p.url() !== 'about:blank') checkUrl(p.url());
  return await p.screenshot({ type:'png', fullPage:false, timeout:15000 });
}
export async function browserSourceProbe() {
  const p = await getPage();
  if (p.url() === 'about:blank') return {error:'Open an authenticated ERPNext Desk page first.'};
  checkUrl(p.url());
  const response = await p.reload({waitUntil:'domcontentloaded',timeout:20000});
  if (!response) return {error:'Navigation response unavailable.'};
  const html = await response.text();
  const lines = html.split(/\r?\n/);
  // Never expose boot data, cookies, CSRF tokens, or entire HTML.
  const target = lines.map((line,index) => ({line,index:index+1}))
    .filter(item=> /(?:src|href|poster|data-src)\s*=\s*["']?\/?(?:undefined|null)(?=["'\s>])/i.test(item.line) ||
      /(?:url\s*\(\s*["']?\/?undefined)/i.test(item.line));
  return {
    page: safeUrl(p.url()),
    status: response.status(),
    lineCount: lines.length,
    suspectLines: target.slice(0,20).map(item=>({
      number:item.index,
      element: (item.line.match(/<(?:script|img|link|source|audio|video|iframe)\b[^>]{0,450}>/i)?.[0] || '').slice(0,450)
    })),
    parserLine173: (() => {
      const line = lines[172] || '';
      const match = line.match(/<(?:script|img|link|source|audio|video|iframe)\b[^>]{0,450}>/i);
      return {line:173, element: match?.[0] || null, lineLength:line.length};
    })(),
    note:'Only suspicious HTML resource tags are returned; raw HTML and user session boot data are withheld.'
  };
}
export async function browserDiagnostics(clear = false) {
  const p = await getPage();
  if (p.url() !== 'about:blank') checkUrl(p.url());
  const suspectElements = await p.locator('[src], [href], [poster], [srcset], [data-src]').evaluateAll(elements =>
    elements.flatMap((element) => {
      const attributes = ['src', 'href', 'poster', 'srcset', 'data-src'];
      const invalid = attributes.filter(name => {
        const value = element.getAttribute(name)?.trim();
        return value === 'undefined' || value === '/undefined' || value === 'null' || value === '/null';
      });
      if (!invalid.length) return [];
      const parent = element.parentElement;
      return [{
        tag: element.tagName.toLowerCase(),
        id: element.id.slice(0, 80),
        className: typeof element.className === 'string' ? element.className.slice(0, 160) : '',
        invalid: invalid.map(name => ({ attribute: name, value: element.getAttribute(name) })),
        parentTag: parent?.tagName.toLowerCase() || null,
        parentClass: typeof parent?.className === 'string' ? parent.className.slice(0, 160) : '',
        htmlSnippet: element.outerHTML.slice(0, 450)
      }];
    }).slice(0, 30)
  );
  const sourceProbe = p.url().includes('/desk') ? await browserSourceProbe().catch(error => ({error: String(error).slice(0,160)})) : null;
  const desktopIconImages = await p.locator('a.desktop-icon').evaluateAll(nodes => nodes.slice(0, 40).map(node => {
    const image = node.querySelector('img');
    return {
      label: (node.getAttribute('data-id') || '').slice(0, 80),
      logo: (node.getAttribute('data-logo') || '').slice(0, 160),
      imageSrc: (image?.getAttribute('src') || '').slice(0, 180)
    };
  }));
  const resourceEntries = await p.evaluate(() => performance.getEntriesByType('resource')
    .filter(e => { try { return new URL(e.name).pathname.endsWith('/undefined'); } catch { return false; } })
    .slice(-12).map(e => ({ initiatorType:(e as PerformanceResourceTiming).initiatorType, durationMs:Math.round(e.duration) })));
  const transientBadImages = await p.evaluate(() => {
    const entries = (window as unknown as {__bridgeBadImages?: Array<Record<string,string>>}).__bridgeBadImages;
    return (entries || []).slice(0,30);
  });
  const messenger = await p.evaluate(() => {
    const root = document.querySelector('.cm-float-root');
    const launcher = document.querySelector('.cm-float-launcher');
    const loadedScripts = Array.from(document.scripts)
      .map(s => s.src).filter(Boolean)
      .filter(src => src.includes('company_messenger'))
      .map(src => { try { return new URL(src).pathname; } catch { return '[invalid]'; } });
    const launcherStyle = launcher ? getComputedStyle(launcher) : null;
    const rootStyle = root ? getComputedStyle(root) : null;
    return {
      scriptPaths: loadedScripts.slice(0,40),
      launcherPresent: !!launcher,
      rootPresent: !!root,
      rootHiddenClass: root?.classList.contains('hidden') ?? null,
      rootDisplay: rootStyle?.display || null,
      rootVisibility: rootStyle?.visibility || null,
      launcherDisplay: launcherStyle?.display || null,
      launcherVisibility: launcherStyle?.visibility || null,
      viewportWidth: innerWidth
    };
  });
  const result = {
    messenger,
    transientBadImages,
    desktopIconImages,
    resourceEntries,
    sourceProbe,
    suspectElements,
    url: safeUrl(p.url()),
    title: await p.title(),
    eventCount: events.length,
    byType: events.reduce<Record<string, number>>((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {}),
    events: events.slice(-100),
    note: 'Collects console warnings/errors, uncaught errors, HTTP >= 400, and failed requests. URLs omit query strings and fragments. Capturing started when the Playwright page was created.'
  };
  if (clear) events.length = 0;
  return result;
}

/** Fast read-only browser usability checks; not a replacement for axe-core. */
export async function browserBasicAccessibility(){
  const p=await getPage();
  if(p.url()!=='about:blank')checkUrl(p.url());
  // Browser-side code is supplied as a literal script: TS transpilers can otherwise inject
  // __name references into callbacks, which do not exist in the page execution context.
  const audit = await p.evaluate(`(() => {
    const visible = e => !!e.getClientRects().length;
    const sample = xs => xs.slice(0,25).map(e=>({tag:e.tagName.toLowerCase(),outer:e.outerHTML.slice(0,160)}));
    const images = Array.from(document.querySelectorAll('img')).filter(e=>visible(e)&&!e.hasAttribute('alt'));
    const buttons = Array.from(document.querySelectorAll('button')).filter(e=>visible(e)&&!(e.innerText.trim()||e.getAttribute('aria-label')||e.getAttribute('title')));
    const inputs = Array.from(document.querySelectorAll('input,select,textarea')).filter(e=>{
      if(!visible(e)||e.getAttribute('type')==='hidden')return false;
      return !e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')&&!e.getAttribute('title')&&!e.closest('label')&&!(e.id&&document.querySelector('label[for="'+CSS.escape(e.id)+'"]'));
    });
    const links = Array.from(document.querySelectorAll('a')).filter(e=>visible(e)&&!(e.textContent?.trim()||e.getAttribute('aria-label')||e.querySelector('img[alt]')));
    return {missingImageAlt:{count:images.length,samples:sample(images)},unlabelledButtons:{count:buttons.length,samples:sample(buttons)},unlabelledInputs:{count:inputs.length,samples:sample(inputs)},unlabelledLinks:{count:links.length,samples:sample(links)}};
  })()`);
  return {url:safeUrl(p.url()),audit:'heuristic (not axe-core)',...(audit as Record<string, unknown>)};
}
/** Read-only performance signals from the current page, using its existing Playwright session. */
export async function browserPerformance(){
  const p=await getPage();
  if(p.url()!=='about:blank')checkUrl(p.url());
  return {url:safeUrl(p.url()),metrics:await p.evaluate(()=>{
    const nav=performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming|undefined;
    const resources=performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    return {domContentLoadedMs:nav?Math.round(nav.domContentLoadedEventEnd):null,loadMs:nav?Math.round(nav.loadEventEnd):null,resourceCount:resources.length,slowResources:resources.filter(x=>x.duration>500).sort((a,b)=>b.duration-a.duration).slice(0,15).map(x=>({type:x.initiatorType,durationMs:Math.round(x.duration),path:(()=>{try{return new URL(x.name).pathname.slice(0,180)}catch{return '[unknown]'}})()}))};
  })};
}


/** Full axe-core audit using a locally installed npm package, without fetching page-side scripts. */
export async function browserAxeAudit(){
  const p=await getPage();
  if(p.url()!=='about:blank')checkUrl(p.url());
  const {createRequire}=await import('node:module');
  const {readFile}=await import('node:fs/promises');
  const require=createRequire(import.meta.url);
  let axePath:string;
  try{axePath=require.resolve('axe-core/axe.min.js');}
  catch{return {enabled:false,note:'Install the audited axe-core package with npm install axe-core. Existing basic accessibility tool remains available.'};}
  const source=await readFile(axePath,'utf8');
  await p.addScriptTag({content:source});
  const result=await p.evaluate(`(async () => {
    const results = await window.axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
    return {
      violations: results.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,help:v.help,helpUrl:v.helpUrl,nodes:v.nodes.slice(0,8).map(n=>({target:n.target,summary:n.failureSummary?.slice(0,300)})),totalNodes:v.nodes.length})),
      passes: results.passes.length,
      incomplete: results.incomplete.length,
      inapplicable: results.inapplicable.length
    };
  })()`);
  return {url:safeUrl(p.url()),engine:'axe-core',results:result};
}

export async function browserClose() {
  if (browserMode() === 'chrome-cdp') {
    // Never close the user's dedicated Chrome profile, only our automation tab.
    if (page && !page.isClosed()) await page.close();
    await browser?.close(); // CDP transport disconnect; Chrome remains running.
  } else {
    await context?.close();
    await browser?.close();
  }
  page=undefined; context=undefined; browser=undefined;
  clearSessionOrigins();
  events.length=0;
  return {closed:true};
}
