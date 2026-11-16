# Codex Bridge — optional development integrations

This upgrade preserves existing browser approval rules, the dedicated Chrome CDP profile, browser actions, and DESIGN.md tools.

## Available immediately after a successful build and bridge restart
- `integration_catalog` — status of six integrations.
- `git_inspect(project_path)` — local Git CLI status and diff summary, read-only.
- `browser_performance` — current approved browser page timing and slow resource summary, read-only.
- `browser_accessibility_basic` — fast heuristic audit of unlabeled inputs/buttons/links/images. **Not axe-core**, not a WCAG certification.
- Existing Playwright browser tools and Chrome CDP diagnostics are unchanged.

## Optional local installation
- Semgrep: https://github.com/semgrep/semgrep — install the Semgrep CLI separately, then set `BRIDGE_SEMGREP_ENABLED=1` in the bridge environment and restart. `semgrep_scan(project_path)` invokes `semgrep scan --config auto --json --metrics off` via fixed arguments and an approved directory. The auto ruleset may access the Semgrep public rule registry. No arbitrary shell commands.
- Full axe-core: https://github.com/dequelabs/axe-core — not installed or embedded. To use its full rules engine, add the package via npm and a separate reviewed adapter.
- Context7: https://github.com/upstash/context7 — not installed. Add its remote MCP server to the agent/client at `https://mcp.context7.com/mcp` and supply credentials per upstream instructions. It is not exposed by this bridge until an approved MCP client adapter is implemented.
- Chrome DevTools MCP: https://github.com/ChromeDevTools/chrome-devtools-mcp — not separately installed. Your bridge already uses CDP and Playwright, so avoid connecting two controllers to the same Chrome tab without isolation.
- Playwright MCP: https://github.com/microsoft/playwright-mcp — not separately installed because the bridge already integrates Playwright directly.
- Git MCP: https://github.com/modelcontextprotocol/servers/tree/main/src/git — not installed. The safe `git_inspect` adapter covers read-only status/diff summaries.

## Validation (run in PowerShell on Windows)
```powershell
cd D:\devbridge-mcp
npm run build
npm run test:integrations
npm run test:design
git status --short
```
Restart the bridge after a successful build. Invoke `integration_catalog`, then `git_inspect` with `D:\devbridge-mcp`, `browser_performance` and `browser_accessibility_basic` on an approved test page. If Semgrep has been installed and opted in, invoke `semgrep_scan` on a test repository.

This file describes **source changes, not completed runtime verification**. The bridge connector has no arbitrary shell or package-install function, so the above commands must be run on the Windows host to validate compilation and runtime registration.

## Second-stage integration adapters (2026-11-13)
- `context7_docs(library_id, query)` calls the fixed public HTTPS endpoint `https://context7.com/api/v2/context` and sends only the explicit library ID and question; no local source files or credentials are included in the URL. To enable, set `BRIDGE_CONTEXT7_ENABLED=1` in `.env.local`; optional `CONTEXT7_API_KEY=...` supplies an API key in the Authorization header. Context7 allows limited unauthenticated requests. Restart the bridge after updating the environment.
- `browser_axe_audit()` uses locally installed `axe-core` on the currently approved browser page. Install with `npm install axe-core` in the bridge folder, then build and restart. It does not fetch or install browser scripts at runtime. Unlike the basic audit, axe-core can report WCAG rule violations with example target nodes.
- `semgrep_scan(project_path)` remains a separate opt-in CLI adapter. On Windows, install the Semgrep CLI via `pipx install semgrep` (or `uv tool install semgrep`); verify `semgrep --version`. Then enable `BRIDGE_SEMGREP_ENABLED=1` in `.env.local` and restart. Scanning with the `auto` config may contact Semgrep's public rules registry.

### Validation
```powershell
cd D:\devbridge-mcp
npm install axe-core
npm run build
npm run test:integrations
npm run test:design
```
Once the MCP connector refreshes, test `browser_axe_audit` on a locally approved page and `context7_docs` with library ID `/facebook/react` and a short React question. Never put API keys in the chat transcript.

The code for these adapters has been saved, but the additional package installation, Windows compilation, remote Context7 lookup and full axe-core runtime test must still be verified.
