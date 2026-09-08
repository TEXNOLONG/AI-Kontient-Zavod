---
name: Multi-tenant publishing model
description: Account isolation and channel ownership rules for the content platform.
---

The platform is intended for many users: VK login identifies the user and workspace, while each destination channel is connected separately and owned by that user. Telegram publishing must use bot membership/admin permission checks; never treat the VK login session as Telegram publishing authorization.

**Why:** A shared session or global channel token would publish one user's content into another user's channels and create a serious data and security boundary failure.

**How to apply:** Add explicit user/workspace ownership to projects, posts, schedules, and social connections; scope every query by the authenticated user; encrypt provider credentials; keep provider adapters separate from login.