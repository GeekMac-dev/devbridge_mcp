# Publishing the bridge safely

This is a source-only copy. The original Git history, .env.local, browser sessions, indexes, caches, dependencies, build outputs, and logs are excluded.

## Setup

1. Install Node.js; run npm ci.
2. Copy .env.example to .env.local and configure your own paths and credentials.
3. Run npm run build and the applicable npm test scripts.
4. Review exposed commands and security boundaries before enabling remote access.

## Before publishing

Use a new Git repository. Inspect all files for secrets, customer data, usernames, local paths, private server names, and proprietary content. Never commit .env.local, profiles, databases, credentials, or logs.
