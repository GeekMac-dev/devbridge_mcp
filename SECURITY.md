# Security Policy

DevBridge MCP can read and edit local project files, invoke controlled commands, and interact with development browsers. Security issues affecting authentication, path restrictions, command execution, browser permissions, tunnel configuration, or secret handling are especially important.

## Supported versions

| Version | Security support |
| --- | --- |
| Latest release on `main` | Best-effort security fixes |
| Older versions and forks | Not guaranteed |

This is a community-maintained open-source project. No fixed response or remediation time is promised.

## Privately reporting a vulnerability

**Do not publish exploit details, private credentials, screenshots containing sensitive data, or proof-of-concept payloads in public issues or pull requests.**

1. Check whether [GitHub Private Vulnerability Reporting](https://github.com/GeekMac-dev/devbridge_mcp/security/advisories/new) is enabled for this repository. If it is, use it.
2. If private reporting is not available, open a **non-sensitive** issue titled `Request private security contact` with no vulnerability details, and ask the maintainer for a secure communication channel before sharing any details.
3. Once a private channel is established, provide affected versions, a minimal reproduction (without real secrets), impact, and a possible mitigation.

Please allow the maintainer an opportunity to investigate before public disclosure. Coordinated disclosure is encouraged but no turnaround is guaranteed.

## Secure deployment guidance

- Bind the local HTTP server to `127.0.0.1` and use bearer-token authentication.
- Restrict `BRIDGE_WRITE_ROOTS` to specific trusted projects.
- Keep terminal commands, PowerShell scripts, browser access, and external integrations disabled until explicitly required.
- Never expose local MCP, Chrome debugging (CDP), or activity-viewer ports to the public Internet.
- Prefer a supported authenticated Secure MCP Tunnel over open forwarding.
- Never commit `.env.local`, tunnel keys, bearer tokens, browser profiles, logs, databases, or client data.

See [PLUGINS_SETUP.md](PLUGINS_SETUP.md) and [README.md](README.md) for setup details.
