# ChatGPT Plugins setup — DevBridge MCP

This guide explains how to connect the **DevBridge MCP MCP server** to ChatGPT Plugins. It does not require Docker or a database server.

## A. Requirements and eligibility

**Computer:** Windows, PowerShell, Node.js/npm, and Git. Clone this repository, run `npm ci`, and build. The owner of the computer must authorize local file access and command execution.

**ChatGPT:** You need permission to add a custom MCP server under **Plugins**. OpenAI's current guidance describes the following differences:

- **Business:** Workspace admins/owners can create and publish custom MCP connections.
- **Enterprise/Edu:** Admins/owners and authorized developers can test connections; admins/owners publish to the workspace, with additional access controls.
- **Pro:** Custom MCP connectivity may be limited to read/fetch actions; full write/modify MCP is not generally available. Other personal accounts may not show the same creation tools. Check the settings shown in your account before assuming full availability.
- Browser-based custom MCP creation is supported on ChatGPT **web**.

See [OpenAI's official feature and permissions guide](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt). Availability may change.

**Connection:** The ChatGPT web service cannot reach `http://localhost:8788/mcp` on your PC directly. Choose one supported option:

- **Recommended:** OpenAI Secure MCP Tunnel, provided your account/workspace has tunnel access. This keeps the local MCP server off the public Internet.
- **Advanced alternative:** Your own reachable **HTTPS** MCP endpoint with authentication, TLS, and network protection. Avoid generic unauthenticated public tunnels.

This repository does not contain a tunnel binary, ChatGPT subscription, credentials, or a hosting service.

## B. Configure and start the local bridge

In PowerShell:

```powershell
git clone https://github.com/YOUR-ACCOUNT/YOUR-REPO.git
cd YOUR-REPO
npm ci
Copy-Item .env.example .env.local
```

Edit `.env.local` and set `BRIDGE_WRITE_ROOTS` to your real, trusted project folder(s). If you need ChatGPT to build and test projects, enable `BRIDGE_PROJECT_COMMANDS_ENABLED=1`. For terminal operations, separately enable `BRIDGE_TERMINAL_ENABLED=1`. Enable controlled scripts only when needed.

Start the local authenticated server:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

The launcher generates a random bearer token if the configured token file does not exist. Default location: `%LOCALAPPDATA%\DevBridgeMCP\mcp-token.txt`. **Do not paste the token into GitHub issues or commit it.**

Verify local health from a second terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8788/health
```

Health is intentionally a public local diagnostic endpoint. The MCP tool endpoint `/mcp` requires the bearer token.

## C. Create, download, and configure an OpenAI Secure MCP Tunnel

The tunnel needs **three separate values/components**: a tunnel ID, a restricted runtime API key, and the official `tunnel-client` binary. The bridge's local MCP bearer token is a different credential.

### C1. Create a tunnel in OpenAI Platform

1. Open [Platform → Organization → Tunnels](https://platform.openai.com/settings/organization/tunnels) and select the intended Platform organization.
2. Creating or editing tunnels requires **Tunnels Read + Manage**. Running the client and selecting the tunnel in ChatGPT requires **Tunnels Read + Use**. If access is denied, ask the organization owner/RBAC admin to assign the right role.
3. Select **Create tunnel**, name it (for example, `DevBridge MCP Development`), and associate it with the target ChatGPT workspace. Tunnel visibility depends on workspace associations.
4. Copy the `tunnel_id` that begins with `tunnel_`.

### C2. Create a restricted runtime API key

1. Open [Platform → Runtime API Keys](https://platform.openai.com/settings/organization/api-keys).
2. Create a **Restricted** runtime API key with **Tunnels Read + Use** permissions, not broad All access.
3. Store the key securely as `CONTROL_PLANE_API_KEY` on your own machine. It authenticates the running tunnel client.
4. Do **not** create or use a Platform **admin key** for routine tunnel operation. `OPENAI_ADMIN_KEY` is only for administrative tunnel creation/listing/updating/deleting via CLI, not the runtime.

### C3. Download and install the tunnel client

1. Use the download button on [Platform Tunnels](https://platform.openai.com/settings/organization/tunnels), or download a supported Windows release from [openai/tunnel-client releases](https://github.com/openai/tunnel-client/releases/latest).
2. Install/extract the official Windows client to a directory you control, such as `C:\Tools\tunnel-client`. Do not upload binaries or credentials to this repository.
3. Confirm the executable and current instructions in PowerShell:

```powershell
& 'C:\Tools\tunnel-client\tunnel-client.exe' help quickstart
& 'C:\Tools\tunnel-client\tunnel-client.exe' help doctor
```

Current releases use `tunnel-client`. Some earlier packaged versions may be named `tunnel-client-runtime.exe`; follow your downloaded release's instructions.

### C4. Configure .env.local (never .env.example with real credentials)

```dotenv
TUNNEL_ROOT=C:\Tools\tunnel-client
CONTROL_PLANE_TUNNEL_ID=tunnel_REPLACE_WITH_YOUR_ID
CONTROL_PLANE_API_KEY=REPLACE_WITH_YOUR_RESTRICTED_RUNTIME_KEY
HOST=127.0.0.1
SQL_BRIDGE_PORT=8788
```

`TUNNEL_ID` remains a compatibility alias for the tunnel identifier. The local MCP token created by `start-local.ps1` is **separate** from the Platform runtime key.

### C5. Start and verify

Start the local MCP bridge in one PowerShell window:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

Verify `http://127.0.0.1:8788/health`. Keep that server running. In another window, start the official tunnel client using its supported command or the **optional compatibility launcher**:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-chatgpt-tunnel.ps1 -TunnelOnly
```

The compatibility launcher forwards the local bridge bearer token to the HTTP MCP server. If your downloaded client does not support its flags, follow `tunnel-client help quickstart` and use a supported profile with a correctly configured local Authorization header; do not disable MCP authentication to work around an error.

Use the tunnel client's `/readyz` and `/ui` endpoints at its reported loopback health address (often `127.0.0.1:8080`). Confirm **ready/healthy and active polling** before creating a ChatGPT plugin. Leave the tunnel running during discovery and subsequent tool calls.

No inbound public firewall port is needed: the client makes outbound HTTPS connections to `api.openai.com:443` and forwards requests locally.

Official details: [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) and [tunnel-client operator guide](https://github.com/openai/tunnel-client/blob/master/docs/end-user-guide.md).

## D. Add the MCP server under ChatGPT Plugins

1. In **ChatGPT on the web**, open **Plugins**.
2. Select **+** → **Add custom MCP server** (where permitted).
3. Name it **DevBridge MCP**, optionally describe its local development tools.
4. Under **Connection**, select **Tunnel** and choose your available Secure MCP Tunnel or enter its assigned tunnel ID. Alternatively provide your own secured public HTTPS MCP URL ending in `/mcp`.
5. Configure authentication according to your tunnel/HTTPS deployment. The local service requires a bearer token, and the tunnel launcher supplies it upstream.
6. Read the risk warning carefully and select the acknowledgment checkbox.
7. Select **Create as a plugin**, inspect all discovered tools and permissions, and install the plugin.
8. Start a new conversation and type `@DevBridge MCP` to select it. Try `git_inspect` or `list_directory` on an authorized project before using modifying actions.

A custom plugin will not grant permissions that your ChatGPT plan or workspace does not support. Some writes need explicit confirmation. For managed workspaces, an administrator may need to publish the connection or grant access.

For up-to-date UI details, follow [Connecting custom MCP servers in ChatGPT](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).

## E. Suggested first tests

Ask your plugin to inspect a project under an approved root:

```text
Inspect my project at D:\Projects\example. List its files, show Git status,
and report whether there are uncommitted changes. Do not modify anything.
```

After verifying read access and explicitly enabling project commands:

```text
Run the project's supported build and test commands, report results,
and do not edit files without asking.
```

For file editing and terminal execution, review the results, directory scope, and action confirmations. Never point a test at personal documents or production systems.

## F. Common errors

| Symptom | Possible cause / remedy |
| --- | --- |
| No Add custom MCP server option | Account/workspace capability or permission is unavailable; consult your admin and OpenAI's current eligibility guide |
| `http://localhost` fails in ChatGPT | ChatGPT web cannot reach your PC directly; use a supported tunnel or HTTPS endpoint |
| 401 Unauthorized | Missing or incorrect bearer token forwarded by the tunnel |
| 503 Authentication unavailable | Token file path incorrect, missing, unreadable, or shorter than 32 characters |
| Connection times out | Local bridge stopped, tunnel stopped, wrong port, firewall or tunnel configuration |
| Read tools work but writes don't | Plan, workspace/plugin permissions, tool opt-in flags, or user confirmation requirements |
| Command disabled | Enable its exact opt-in setting in `.env.local`, restart bridge |
| Plugin tool list outdated | Refresh tools or reconnect the plugin where supported |
| Browser not opening pages | Enable browser, approve development origins, confirm browser mode and Playwright installation |

## Important security considerations

The bridge runs with your Windows user's local permissions. It can read and modify authorized project content and invoke controlled commands. Only connect it on a trusted computer; configure the narrowest useful project roots. Keep bearer tokens and tunnel credentials out of source control and chat messages. Do not expose CDP port 9223, MCP port 8788, or a development HTTPS proxy to the public Internet.

Disable browser and command access when not needed. Do not enable tool write access for untrusted users. Test the workflow privately before sharing it with a workspace.