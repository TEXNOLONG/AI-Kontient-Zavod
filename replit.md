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

- Channel credentials are encrypted with AES-256-GCM using `SESSION_SECRET` and are never returned to the browser.
- Publishing jobs are created per post and per channel; a server timer processes due jobs every 30 seconds.
- VK, OK, Telegram and MAX use their official HTTP APIs. Dзен is represented by an HTTPS webhook bridge because there is no universal public publishing API in this integration.
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
