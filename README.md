# DevBridge MCP

Created and maintained by **[GeekMac-dev](https://github.com/GeekMac-dev)**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A Windows-based local MCP server for AI-assisted programming. The public edition provides file inspection and editing, controlled terminal and project tasks, Git inspection, browser testing, UI/UX design references, optional coding integrations, activity monitoring, and local Codex CLI history search.

**Not included:** private data, personal development profiles, SQL analytics, sales reporting, ERPNext-specific WSL automation, mobile gateway, or animation studio features.

## Requirements

- Windows 10/11 and PowerShell 5.1 or newer
- Node.js and npm (install an active supported Node.js LTS release)
- Git for Git inspection and repository workflows
- Your own source projects, with explicit local file permissions
- Optional: Chrome or Playwright Chromium, Semgrep CLI, Context7 API key, local Codex CLI history
- **For ChatGPT Plugins:** a compatible ChatGPT account/workspace with permission to add custom MCP servers, plus a supported **Secure MCP Tunnel** or a properly protected public HTTPS MCP endpoint. Access to tunnel software and credentials is not included in this repository.

No Docker, MariaDB, SQL Server, or paid integrations are required.

## 1. Install on your computer

Open PowerShell in the cloned repository:

```powershell
git clone https://github.com/GeekMac-dev/devbridge_mcp.git
cd devbridge_mcp
npm ci
npm run build
npm run test:integrations
npm run test:design
Copy-Item .env.example .env.local
```

Edit `.env.local` to match **your machine**. In particular set `BRIDGE_WRITE_ROOTS` to the directories you want the bridge to access, such as `D:\Projects`. Do not set broad drive roots unless you understand the risks. The supplied `.env.example` deliberately starts optional execution/browser features disabled.

Start the authenticated local HTTP MCP server:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

This script loads `.env.local`, builds the project, creates a long random local MCP token if one does not already exist, and starts the server at `http://127.0.0.1:8788/mcp` (unless you changed the port). The token is stored in `%LOCALAPPDATA%\DevBridgeMCP\mcp-token.txt`; the value is never printed. Keep that file private.

In another PowerShell terminal, check health:

```powershell
Invoke-RestMethod http://127.0.0.1:8788/health
```

A healthy response confirms the HTTP server started. It does **not** confirm ChatGPT connectivity or permissions.

**Important:** `npm run start:http` or `npm start` alone does not parse `.env.local`. Use `start-local.ps1` for the HTTP setup shown here. `npm start` starts the stdio MCP server for compatible local MCP clients and is separate from connecting ChatGPT on the web.

## 2. Connect through ChatGPT Plugins

Follow the detailed **[Plugins setup guide](PLUGINS_SETUP.md)** for account requirements, tunnel configuration, authentication, and plugin creation.

Summary:

1. Start the bridge locally using `scripts/start-local.ps1`.
2. Connect your local MCP endpoint through an authorized **Secure MCP Tunnel**, or deploy behind your own properly authenticated HTTPS endpoint. Never expose port 8788 directly.
3. In ChatGPT on the web, open **Plugins → + → Add custom MCP server** where that option is available to you.
4. Choose the supported **Tunnel** connection and provide your tunnel ID, or choose your secured HTTPS MCP URL. Configure authentication according to the endpoint or tunnel.
5. Review the risk warning, create the plugin, inspect discovered tools, and install/test it in a conversation by mentioning it with `@`.

Custom server features, especially **write/modify actions**, are account/workspace dependent. Some personal plans may have only read/fetch access. Business and Enterprise/Edu workspaces have additional admin and permission requirements. See the [official ChatGPT custom MCP connection guide](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).

## 3. Enable only the programming tools you need

| Capability | Environment setting | Default |
| --- | --- | --- |
| Allowed project directories | `BRIDGE_WRITE_ROOTS` | Example placeholder; edit |
| Project build/test tasks | `BRIDGE_PROJECT_COMMANDS_ENABLED=1` | Off |
| Controlled terminal operations | `BRIDGE_TERMINAL_ENABLED=1` | Off |
| Controlled PowerShell scripts | `BRIDGE_TERMINAL_SCRIPTS_ENABLED=1` | Off |
| Browser testing | `BRIDGE_BROWSER_ENABLED=1` | Off |
| Approved browser origins | `BRIDGE_BROWSER_ALLOWED_ORIGINS` | Empty |
| Local activity tracking | `BRIDGE_ACTIVITY_ENABLED=1` | Off |
| Semgrep scan | `BRIDGE_SEMGREP_ENABLED=1` | Off |
| Context7 documentation lookup | `BRIDGE_CONTEXT7_ENABLED=1` | Off |
| Context7 credential | `CONTEXT7_API_KEY` | Empty |
| Optional Codex history location | `CODEX_HOME` | Auto-detected |

If a tool reports that it is disabled, review the relevant setting and restart the bridge. Opt-in settings do **not** install external tools. Example: enabling Semgrep requires Semgrep to be separately installed. Consult [PLAYWRIGHT_SETUP.md](PLAYWRIGHT_SETUP.md) for browser-mode configuration.

## License, creator credit, and contributions

DevBridge MCP is released under the [MIT License](LICENSE).

**Copyright © 2026 GeekMac-dev.** You may use, modify, and redistribute this project under the MIT terms. Redistributions and substantial copies must retain the copyright and license notice. A link back to [the original repository](https://github.com/GeekMac-dev/devbridge_mcp) is appreciated, although the MIT License does not require a prominent credit in your app interface.

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Only contribute code you have the rights to license, and preserve existing third-party copyright notices and licenses where applicable.

## Community standards

- [Code of Conduct](CODE_OF_CONDUCT.md) — respectful, constructive collaboration.
- [Contributing Guidelines](CONTRIBUTING.md) — contribution workflow and checks.
- [Security Policy](SECURITY.md) — private vulnerability reporting and safe operation.
- [Issue Templates](.github/ISSUE_TEMPLATE) — bug reports and feature requests.
- [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md) — changes, tests, and security checklist.
- [Accessibility Statement](ACCESSIBILITY.md) — accessibility goals and reporting.

## 4. Security and sharing

Never publish `.env.local`, bearer tokens, tunnel IDs or API keys, logs, browser profiles, indexes, credentials, company source code, or user data. The repository's `.gitignore` excludes common generated/private paths, but review `git status` and `git diff --cached` before every push. Use **a fresh Git repository** rather than copying history from a private checkout.

Even with this bridge on localhost, tools can edit local files and execute approved tasks as your Windows user. Only install and connect this bridge on computers and projects that you own or are authorized to administer. Read [PUBLISHING.md](PUBLISHING.md) before making a fork public.

## Troubleshooting

- **No `.env.local`:** copy the supplied example and update the project roots.
- **Unauthorized / 401:** check that the tunnel passes your token as an Authorization bearer header.
- **503 MCP authentication unavailable:** check that the token file exists, the bridge account can read it, and `MACBRIDGE_MCP_TOKEN_FILE` points to it.
- **Plugin cannot connect:** ChatGPT cannot use a loopback URL directly; start or configure a supported tunnel or secured public endpoint.
- **No write tools in ChatGPT:** check plan/workspace eligibility and plugin permissions. Some plans support only read/fetch.
- **No tools / stale tools:** reconnect or refresh the plugin tool list where supported.
- **Missing terminal or browser actions:** review the opt-in variables and restart the bridge.
- **Build fails:** run `npm ci` and verify your installed Node.js version.

## Development commands

```powershell
npm run build
npm run test:integrations
npm run test:design
npm run scan
npm run activity
```

Official documentation: [Custom MCP servers in ChatGPT](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt) · [Plugins in ChatGPT](https://help.openai.com/en/articles/20001256-plugins-in-chatgpt).
