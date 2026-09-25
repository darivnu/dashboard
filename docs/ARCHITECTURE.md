# Architecture

## 1. Shape: a Bun workspace, not "backend/" + "frontend/"

The repo root has no `backend/` or `frontend/` folder. Instead it's a **Bun
workspace** (declared in the root `package.json`) with two packages under
`apps/`:

```
dashboard/
├── apps/
│   ├── api/     -> Elysia (Bun) HTTP API + PostgreSQL, via Drizzle ORM
│   └── web/     -> React 19 + Vite frontend
├── docker-compose.yml
├── Dockerfile
└── package.json -> { "workspaces": ["apps/*"] }
```

`apps/api` *is* the backend and `apps/web` *is* the frontend — they're just
named after what they are (an API service, a web client) rather than after
their architectural role. This is a common convention in monorepos that
expect to eventually hold more than one app of each kind (e.g. `apps/admin`,
`apps/mobile`, `apps/worker`), so "backend/frontend" would already be the
wrong axis to split on. `apps/*` groups deployable units; each one internally
separates concerns (routes, services, db, lib, etc.).

The two apps aren't independent services talking over a network boundary in
dev/prod — the API **serves the built web app as static files** (see §4), so
in production this is a single deployable, not a client/server pair with
separate hosts.

## 2. `apps/api` — the backend

Stack: [Elysia](https://elysiajs.com/) (a Bun-native HTTP framework) +
[Drizzle ORM](https://orm.drizzle.team/) over PostgreSQL.

```
apps/api/src/
├── server.ts              entrypoint: reads env, calls app.listen()
├── app.ts                 builds the Elysia app: middleware + route mounting
├── config/env.ts          typed env var loading/validation (fail fast)
├── lib/                   cross-cutting helpers (errors, http, mailer, password, tokens)
├── plugins/session.ts     Elysia macro: `auth: true` guards a route via session cookie
├── db/
│   ├── schema.ts          Drizzle table definitions (source of truth for the schema)
│   ├── client.ts          postgres-js connection + drizzle() instance
│   └── migrate.ts         runs pending SQL migrations on boot
├── modules/                one folder per HTTP feature area
│   ├── auth/                register/login/logout/me — routes + service + repo layers
│   └── about/                GET /about.json (see §5)
└── services/                the "service/widget registry" — see §5
apps/api/drizzle/            generated SQL migrations + snapshots (drizzle-kit)
apps/api/scripts/            codegen (service manifest, see §5)
```

Each **module** under `src/modules/` follows a light layering:
- `*.routes.ts` — Elysia route definitions, request/response schemas (`t.Object(...)`)
- `*.service.ts` — business logic
- `*.repo.ts` — DB access (Drizzle queries)

Auth is **session-cookie based**, not JWT: `POST /auth/login` creates a row in
the `sessions` table and sets an httpOnly cookie holding a random token; the
DB stores only the token's hash. `plugins/session.ts` exposes an `auth: true`
macro that route handlers opt into, which resolves the cookie to a user or
throws `401`.

Errors are centralized: `lib/errors.ts` defines `AppError` (a typed,
status-carrying exception) and a global Elysia `onError` handler that maps
`AppError`, validation errors, parse errors, and 404s to a consistent
`{ error, message }` JSON shape.

## 3. `apps/web` — the frontend

Stack: React 19 + Vite. Currently minimal (`src/main.tsx` renders a
placeholder `<h1>`) — this app is scaffolded but not yet built out.

`vite.config.ts` proxies `/health` to `http://localhost:8080` in dev, so the
Vite dev server (default port 5173) can talk to a locally running API without
CORS issues.

## 4. How the two apps come together in production

`Dockerfile` is a multi-stage build:
1. Install workspace deps with `bun install`, then `bun run build` — this
   runs each app's own `build` script (`apps/api` bundles `src/server.ts` via
   `bun build`; `apps/web` runs `tsc && vite build` into `apps/web/dist`).
2. The final image only contains `apps/api`'s built output, plus
   `apps/web/dist` copied in next to it (`../web/dist` relative to the api's
   `dist/`).
3. At runtime, `app.ts` checks `existsSync('../web/dist')` and, if present,
   mounts `@elysiajs/static` to serve it at `/` with `indexHTML: true` (SPA
   fallback).

So the API process **is** the web server for the built frontend — there's no
separate frontend server/container in production. This is also why running
`docker compose up --build` (§6) is sufficient to get the whole app: one
container serves both API routes (under `/api`) and the SPA (everything
else).

In local dev, by contrast, you'd typically run `apps/web`'s Vite dev server
and `apps/api`'s Bun server side by side for hot reload (see §6).

## 5. The service/widget registry (`apps/api/src/services/`)

This is the most distinctive piece of the backend. It's an in-memory registry
that third-party "services" (e.g. GitHub, Spotify — external integrations)
register themselves into, each exposing one or more "widgets" the dashboard
frontend can render:

- `services/types.ts` — the shapes: `ServiceDef`, `WidgetDef`, `ParamDef`,
  auth kind (`none` / `apiKey` / `oauth2`), refresh interval constraints.
- `services/registry.ts` — a `Map<string, ServiceDef>` with `register()` (validates
  uniqueness of service/widget/param IDs and refresh bounds) and read accessors
  (`getService`, `getWidget`, `listServices`).
- `services/definitions/*.ts` — one file per concrete service, each calling
  `registry.register({...})` as an import side effect. `definitions/index.ts`
  is **auto-generated** (see the `// AUTO-GENERATED` header) by
  `scripts/generate-service-manifest.ts`, which globs the directory and
  writes an import for every file. It reruns automatically via the `predev`
  / `prebuild` npm scripts, so a new definition file is picked up without
  hand-editing the index.
- `modules/about/about.routes.ts` exposes this registry over HTTP as
  `GET /about.json` — a manifest of every registered service and its
  widgets/params, which the frontend is expected to use to know what it can
  display and what inputs each widget needs.

No concrete service definitions exist yet (`definitions/` only has the
generated empty index) — this is scaffolding for a plugin-style architecture
where each integration is a self-contained file.

## 6. Running it

**Requirements:** Bun 1.x, Docker with Compose.

### Everything in Docker (closest to production)
```sh
docker compose up --build
```
Builds and runs Postgres + the API (which serves the built web app). App at
`http://localhost:8080`.

### Local dev (hot reload, separate processes)
```sh
bun install
docker compose up -d db          # just Postgres, in the background
cp apps/api/.env.example apps/api/.env
cd apps/api && bun run dev       # runs migrations, then `bun --watch src/server.ts`
```
This gives you the API on `:8080` with file-watching. Run the web app
alongside it for the React dev server with HMR:
```sh
cd apps/web && bun run dev       # Vite on :5173, proxies /health to :8080
```
Or, from the repo root, `bun run dev` uses Bun's workspace `--filter '*'` to
run every app's own `dev` script concurrently.

### Environment variables (`apps/api/.env`, see `.env.example`)
| Var | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | gates dev-only behavior (e.g. OpenAPI docs, cookie `secure` flag) |
| `PORT` | `8080` | API listen port |
| `DATABASE_URL` | — (required) | Postgres connection string |
| `APP_URL` | — (required) | canonical app URL |
| `SESSION_TTL_DAYS` | `30` | session cookie/DB expiry |

`config/env.ts` validates these eagerly at import time (fails fast with a
clear error instead of failing later on first use).

### Database
- Schema lives in `apps/api/src/db/schema.ts` (Drizzle table definitions).
- `bun run db:generate` (drizzle-kit) diffs the schema against
  `apps/api/drizzle/` and writes a new migration SQL file.
- `bun run db:migrate` / `bun run migrate` applies pending migrations
  (the latter also runs automatically before `bun run dev` and as the
  container's entrypoint, via `src/db/migrate.ts`).
- `bun run db:studio` opens Drizzle Studio (a DB browser UI) against
  `DATABASE_URL`.

### Tests
Test files sit next to the code they test (`*.test.ts`, e.g.
`services/registry.test.ts`, `modules/about/about.routes.test.ts`) and run
with Bun's built-in test runner: `bun test` from `apps/api`.

### API docs
When `NODE_ENV=development`, `@elysiajs/openapi` is mounted on the `/api`
group, giving you an interactive OpenAPI/Swagger UI for the API. It's
excluded in production (see the `f33ac6b hotfix` commit).
