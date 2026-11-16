# Browser testing setup (optional)

Browser tools are **disabled by default**. Enable them only for development websites you trust. Browser actions can view authenticated pages and potentially modify data.

## Recommended: isolated Playwright Chromium

In `.env.local`:

```dotenv
BRIDGE_BROWSER_ENABLED=1
BRIDGE_BROWSER_MODE=chromium
BRIDGE_BROWSER_HEADLESS=1
BRIDGE_BROWSER_ALLOWED_ORIGINS=http://127.0.0.1:5173
```

Change the allowed origin to your own development site. Use `BRIDGE_BROWSER_REALTIME_ORIGIN` only if your application uses a separate and trusted realtime origin.

Install the Playwright Chromium browser if it is not already available:

```powershell
npx playwright install chromium
```

Restart `scripts/start-local.ps1` after changing the environment. Browser tools only open approved origins. Private-network and plain-HTTP origins may need a separate local approval.

## Optional: dedicated Chrome via CDP

If you need your own Chrome session, set `BRIDGE_BROWSER_MODE=chrome-cdp`. Start Chrome yourself with an **isolated testing profile** and `--remote-debugging-port=9223`, bound only to loopback. Do not use your normal personal Chrome profile, and do not expose CDP port 9223 to a network.

Example (adjust the Chrome executable location):

```powershell
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' --remote-debugging-address=127.0.0.1 --remote-debugging-port=9223 --user-data-dir="$env:LOCALAPPDATA\DevBridgeMCP\chrome-test"
```

This repository intentionally does not bundle a company-specific Chrome launcher.

## Origin approval

On a trusted development site, use the included `scripts/browser-permissions.mjs` helper to approve an origin on your own PC:

```powershell
node .\scripts\browser-permissions.mjs allow-once http://127.0.0.1:5173 --allow-private --allow-http
node .\scripts\browser-permissions.mjs list
```

For full syntax, inspect the help output for the script. A remote tool should not silently grant its own browser permissions.

## Safety notes

Screenshots and DOM snapshots may contain customer data, login information, or private content. Keep browser debugging on test environments. Do not expose browser debugging ports, and close the dedicated testing browser when finished. Browser clicking and filling may require explicit confirmations.
