---
name: MAX TLS trust bundle
description: Node.js trust configuration required for the MAX platform API.
---

The MAX API certificate chain requires a CA bundle containing both the official Russian Trusted Sub CA and its Russian Trusted Root CA. Supplying only the intermediate to `NODE_EXTRA_CA_CERTS` still produces `UNABLE_TO_GET_ISSUER_CERT` in Node fetch.

**Why:** The MAX endpoint serves a leaf certificate with the Russian Sub CA, while the default Replit/Node trust store does not contain the Russian root.

**How to apply:** Keep TLS verification enabled and set `NODE_EXTRA_CA_CERTS` before the Node process starts in both development and production; verify with a real Node fetch, not only `openssl`.