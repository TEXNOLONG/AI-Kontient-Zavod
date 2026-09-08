---
name: VK OAuth callback
description: Redirect-path compatibility rule for the VK ID login flow.
---

The VK login flow supports both the configured `/api/auth/vk` redirect path and the canonical `/api/auth/vk/callback` path. The exact redirect URI must stay identical between the VK application settings and the token exchange request.

**Why:** The first VK app configuration used the shorter `/api/auth/vk` path, while the implementation initially expected `/api/auth/vk/callback`; accepting both prevents a silent redirect loop during setup.

**How to apply:** Keep the configured `VK_REDIRECT_URI` as the source of truth, preserve both route handlers when changing auth routing, and complete the flow only after `VK_CLIENT_SECRET` is stored in protected secrets.