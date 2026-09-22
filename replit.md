# AI Контент Завод

Контентная система для создания Brand DNA, генерации публикаций и автоматического выхода постов в подключённые соцсети.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — signing key for email login sessions and encryption of channel credentials
- Optional env: `MISTRAL_API_KEY`
- VK OAuth env: `VK_CLIENT_ID`, `VK_CLIENT_SECRET` (when required by the VK application), `VK_OAUTH_REDIRECT_URI` (for example `https://your-domain.example/api/channels/vk/oauth/callback`)
- Optional VK OAuth env: `VK_OAUTH_SUCCESS_URL` (defaults to `/settings`)

## VK autopublishing

1. Create a VK ID application and set its callback URL to `VK_OAUTH_REDIRECT_URI`.
2. Add `VK_CLIENT_ID`, `VK_CLIENT_SECRET` when required by the VK application, and `VK_OAUTH_REDIRECT_URI` to the API environment.
3. Create or use a VK community where the VK account has editor or administrator rights.
4. Sign in to the app and open **Настройки → Каналы → Подключить канал → VK**.
5. Enter a channel name and the community ID (`-123456`, `123456`, or `vk.com/club123456`), then click **Войти через VK**. VK ID OAuth with PKCE handles authorization; access and refresh tokens are encrypted before storage and are never returned to the browser.
6. Approve the requested VK permissions.
7. Click **Проверить**. The app calls VK `groups.getById` and reports whether the OAuth session can access the selected community.
8. Approve a post, choose the VK channel in **Календарь**, select a date and time, and schedule it. The API queue checks due jobs every 30 seconds and publishes through VK `wall.post`.

The VK application ID, callback URL, and community ID are required to connect a channel. A running API service, `DATABASE_URL`, and `SESSION_SECRET` are also required. The scheduled time is interpreted by the API server; use the server/workspace timezone consistently when creating schedules.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ai-content-factory` — React/Vite product UI
- `artifacts/api-server/src/routes/content.ts` — projects, content and calendar API
- `artifacts/api-server/src/routes/publishing.ts` — channel connections, immediate publishing and queue processing
- `artifacts/api-server/src/lib/publishing.ts` — provider adapters and credential encryption
- `lib/db/src/schema/content.ts` — projects, posts and calendar tables
- `lib/db/src/schema/publishing.ts` — social channel and publishing queue tables
- `lib/api-spec/openapi.yaml` — API source of truth; regenerate clients with `pnpm --filter @workspace/api-spec run codegen`

## Architecture decisions

- Channel credentials are encrypted with AES-256-GCM using `SESSION_SECRET` and are never returned to the browser. VK access tokens are obtained through OAuth and refreshed server-side when needed.
- Publishing jobs are created per post and per channel; a server timer processes due jobs every 30 seconds.
- VK, OK, Telegram and MAX use their official HTTP APIs. VK connections use VK ID OAuth with PKCE rather than manually entered community tokens. Дзен is represented by an HTTPS webhook bridge because there is no universal public publishing API in this integration.
- Social channels and publishing jobs are scoped to the authenticated email account; login credentials are not reused as destination channel tokens.

## Product

- Register and sign in with email, then connect VK, Одноклассники, MAX, Telegram and Дзен channels from Настройки.
- Publish an approved post immediately from the editor.
- Schedule an approved post for selected channels from Календарь.
- Generate and edit content, maintain a brand profile, and monitor competitor ideas.

## User preferences

_No explicit preferences recorded._

## Gotchas

- Run the database schema push after adding or changing tables.
- MAX requires a bot token and chat/channel ID; Telegram requires a bot token and chat ID.
- OK requires an access token, application key and application secret.
- Dзен requires an HTTPS webhook bridge that accepts `{ title, text, channel }`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
