# Architecture

How the dashboard is put together: where the code lives, how a service becomes a widget on screen, how users and their credentials are handled, and how the app is deployed. For installing and running it, see the [root README](../README.md).

## Repository layout

The repo is a **Bun workspace** (the root `package.json` declares `"workspaces": ["apps/*"]`) with two packages:

```
dashboard/
├── apps/
│   ├── api/                 the backend: Elysia HTTP API + PostgreSQL through Drizzle
│   └── web/                 the frontend: React 19 + Vite
├── docs/
├── docker-compose.yml
├── Dockerfile
├── vercel.json
├── deploy.sh
└── package.json
```

`bun run dev` and `bun run build` at the root run the script of the same name in both apps.

The backend source:

```
apps/api/src/
├── server.ts              entry point: calls app.listen()
├── app.ts                 builds the app: registers the services, mounts every route group under /api
├── config/env.ts          reads and validates the environment variables; a bad value stops the boot
├── modules/               one folder per feature of the HTTP API
│   ├── auth/              accounts, sessions, log in with GitHub
│   ├── catalog/           GET /api/catalog: the services and widgets on offer
│   ├── dashboard/         widget instances, their layout and their data
│   ├── subscriptions/     a user's API keys and OAuth connections
│   ├── actions/           operations a user triggers on a service, such as opening a booster pack
│   └── about/             GET /about.json
├── services/              the services the dashboard can show
│   ├── types.ts           what a service, a widget, an action and a param look like
│   ├── registry.ts        the in-memory list of services, with its checks
│   ├── register.ts        fills the registry at boot
│   ├── definitions/       one file per service, plus index.ts listing them
│   ├── oauth/             OAuth providers (GitHub, Spotify) and token refresh
│   ├── params.ts          validates widget and action params against their definition
│   └── pokemon-tcg/       helpers of the Pokémon TCG service
├── lib/                   helpers shared by the modules: cache, crypto, errors, http, mailer, password, rate-limit, tokens
├── plugins/               Elysia plugins: session.ts (who is logged in), cors.ts, rate-limit.ts
└── db/                    schema.ts (tables), client.ts (connection), migrate.ts, encrypted.ts (encrypted columns)
```

`apps/api/drizzle/` holds the SQL migrations generated from `db/schema.ts`.

A module is split in up to three layers: `*.routes.ts` (URLs, request and response schemas), `*.service.ts` (the rules) and `*.repo.ts` (the only layer that queries the database). `*.fakes.ts` files are in-memory repos for the tests. [`BACKEND.md`](BACKEND.md) lists every route and table.

## Services and widgets

A **service** is an outside source of data (NASA, GitHub, Letterboxd). A **widget** is one thing a service can show. Both are described in code, not in the database.

- Each file in `services/definitions/` exports a plain `ServiceDef` object: an id, a name, an auth kind, a list of widgets and optionally a list of actions. Importing the file has no side effect.
- `definitions/index.ts` is maintained by hand. It imports every definition and puts it in one of two arrays: `services`, registered everywhere, or `devOnlyServices` (the mocks), registered only outside production.
- `register.ts` is called once by `app.ts` at boot. It loops over `services`, and over `devOnlyServices` unless `NODE_ENV` is exactly `production`, and hands each one to `registry.register()`.
- `registry.ts` keeps them in a `Map` and refuses a bad definition with an error that stops the boot: a duplicate service, widget or action id, a duplicate param name, a `refresh.min` under 5 seconds or above `refresh.default`, integer bounds that contradict each other, an unknown OAuth provider.

A service has one of three **auth kinds**:

| Kind | What the user does | What `fetch()` receives |
|---|---|---|
| `none` | nothing | only an HTTP client |
| `apiKey` | pastes the fields listed in `auth.fields` | the stored fields as `credentials` |
| `oauth2` | approves the access on the provider's page | `getAccessToken()`, which returns a valid token |

A **widget** declares its params (what the user configures), its `refresh` (`default` and `min`, in seconds) and a `fetch(ctx, params)` function that returns the data. A param marked `hidden` is one the widget writes by itself, so no form shows it.

An **action** is something the user triggers on demand, such as opening a Pokémon booster pack. It declares params, an optional rate limit and a `run()` function. Every action goes through one route, `POST /api/services/:serviceId/actions/:actionId`, and its result is never cached.

Adding a service is covered step by step in [`ADDING_A_SERVICE.md`](ADDING_A_SERVICE.md).

## From catalog to data

1. **Catalog.** `GET /api/catalog` returns the registry as JSON for the logged-in user: every service, its auth kind, its widgets with their params and refresh bounds, and the state of the user's subscription to it. For an `oauth2` service it also says whether the server has credentials for the provider (`available`). The frontend builds the Add dialog and its forms from this answer.
2. **Instance.** Adding a widget calls `POST /api/dashboard/instances`. The API validates the params against the widget's definition, refuses a refresh rate below `refresh.min`, and stores one row in `widget_instances`: service id, widget id, params, `refreshSeconds` and the position (`x`, `y`, `w`, `h`).
3. **Data.** The frontend calls `GET /api/dashboard/instances/:id/data` for each instance. `modules/dashboard/data.service.ts` then:
   - loads the instance and its definition;
   - for an `apiKey` or `oauth2` service, checks that the user has an active subscription, before looking at the cache, so that removing a key takes effect at once;
   - looks in the cache; on a hit it returns the stored data with the time it was fetched;
   - on a miss it calls the widget's `fetch()`, stores the result and returns it.
4. **Cache.** `lib/cache.ts` is an in-memory cache with an expiry per entry and a cap of 1000 entries. An entry lives for the widget's `refresh.min` seconds, so one server instance never calls an outside service more often than that for the same request. The key is the service id, the widget id, a hash of the params and, for services with credentials, the subscription id: two users with the same params on a public service share an entry, two users with different accounts never do. Failures are not cached. The cache is lost on restart.
5. **Polling.** In the browser, `useWidgetData` is a TanStack Query hook with `refetchInterval` set to the instance's `refreshSeconds`. Each widget therefore runs on its own timer. Two older widgets, Random advice and Recent films, do not go through this hook yet: they fetch and poll for themselves.

For an existing instance the data route answers 200 with either `{ ok: true, data, fetchedAt }` or `{ ok: false, code }`. The codes:

| Code | Meaning | What the card shows |
|---|---|---|
| `needs_reauth` | no subscription, or the service rejected the stored credential | a prompt to set the API key or to connect |
| `rate_limited` | the outside service is limiting requests | a message; the next refresh tries again |
| `upstream_error` | the outside service failed or answered something unexpected | a message; the next refresh tries again |
| `invalid_config` | the stored params no longer fit the definition, or the widget no longer exists | a prompt to edit the settings |

When a service answers `needs_reauth`, the subscription is flagged in the database, and later requests skip `fetch()` until the user stores a new credential.

## Authentication and sessions

- **Registration.** `POST /api/auth/register` stores the user with a password hash and emails a verification link. The hash is argon2id (`lib/password.ts`, through `Bun.password`).
- **Email verification.** The link carries a random token valid for 24 hours. The database holds only the SHA-256 hash of that token (`user_tokens`), so reading the database does not give a usable link. Logging in is refused until the address is verified. Without SMTP settings the mail is printed in the API logs.
- **Sessions.** `POST /api/auth/login` creates a row in `sessions` and sets an `httpOnly` cookie named `session` with a random token. Again only the token's hash is stored. A session lasts `SESSION_TTL_DAYS` days. `plugins/session.ts` provides the `auth: true` option that routes use: it hashes the cookie, finds the session and the user, and answers 401 otherwise.
- **Log in with GitHub.** `GET /api/auth/oauth/github` sends the browser to GitHub and the callback creates the same kind of session. An account is found by its GitHub id (`auth_identities`), or linked to an existing verified user with the same email, or created. No GitHub token is kept for logging in.
- **Rate limit.** The register, verify, login, logout and `/me` routes share one limit of 10 requests a minute per IP address (`plugins/rate-limit.ts`), counted in memory by each server instance. The GitHub login routes are not limited.
- **Deleting the account.** `DELETE /api/auth/me` removes the user; every other table hangs off `users` with a cascade delete, so the sessions, subscriptions and widgets go with it.

## Subscriptions and OAuth

A **subscription** is a user's connection to one service: a row in `service_subscriptions` with a status (`active`, `needs_reauth`, `revoked`) and the credentials.

**Encryption.** The `credentials` column is declared with `encryptedJson` from `db/encrypted.ts`, which encrypts on the way into the database and decrypts on the way out. `lib/crypto.ts` uses AES-256-GCM with the key in `MASTER_KEY` and a fresh random IV for each value; the stored text is `v1.<iv>.<ciphertext>.<tag>`. Losing or changing `MASTER_KEY` makes every stored credential unreadable. Credentials are write-only for clients: no route returns them.

**API keys.** `POST /api/subscriptions/:service` checks the body against the service's `auth.fields` and stores it. Sending it again replaces the key and sets the status back to `active`.

**OAuth.** Connecting an `oauth2` service takes three steps:

1. **Authorize.** `GET /api/subscriptions/:service/authorize` generates a random `state` (and a PKCE code verifier for providers that use one), stores them with the service id and the user id in an encrypted `oauth_pending` cookie that lives 10 minutes, and redirects to the provider's consent page.
2. **Provider.** The user approves, and the provider redirects to `APP_URL` + `/api/subscriptions/oauth/:provider/callback` with a `code` and the `state`.
3. **Callback.** The API clears the cookie, checks that the `state` matches and that the same user is still logged in, exchanges the `code` for tokens, stores them encrypted, and redirects to `WEB_URL/dashboard?connected=<service>`. Any failure redirects to `WEB_URL/dashboard?oauth_error=<code>` instead; these routes never answer JSON, because the browser navigates to them.

The redirect address is per provider, not per service, because providers want it registered in advance.

**Token refresh.** `services/oauth/tokens.ts` gives widgets their access token. A token that expires within a minute is refreshed first. The refresh happens once even when several widgets ask together: callers in the same process share one promise, and the row is locked in the database for the case of several server instances. A provider that rejects the refresh token turns the subscription into `needs_reauth`. GitHub OAuth App tokens never expire, so they are never refreshed; Spotify tokens last one hour.

**"Not configured".** A provider whose `OAUTH_<PROVIDER>_CLIENT_ID` and `_CLIENT_SECRET` are unset is not configured. The API still boots; the catalog marks its services `available: false`, the frontend disables their Connect button, and the authorize route redirects with `oauth_error=not_configured`. Setting only one of the two variables stops the boot.

**Disconnecting.** `DELETE /api/subscriptions/:service` deletes the row. For GitHub the authorization is also revoked at the provider; Spotify has no revocation endpoint.

[`HANDLING_OAUTH.md`](HANDLING_OAUTH.md) goes through both OAuth flows in detail.

## Frontend

`apps/web` is a React single-page app. Three pieces tie it to the backend:

- **Eden client.** `api.ts` creates an Eden Treaty client from the API's exported `App` type (`apps/api/src/app.ts`). The frontend imports that type across the workspace, so a route, body or response that changes in the API becomes a type error in the frontend, with no generated code.
- **`widgetRegistry.tsx`.** It maps a `"serviceId/widgetId"` key to a React component, a `parse` function that checks the data the API returned, and a default and minimum size. A widget without an entry shows a "Widget not implemented yet" card.
- **`WidgetShell`.** The card drawn around every widget. It owns what is common to all of them: the title bar and its buttons, fetching and polling through `useWidgetData`, the loading state, one message per error code, and the prompts to set an API key or to connect.

Routing, the grid, the profile and settings pages and the tests are described in [`apps/web/README.md`](../apps/web/README.md).

## Deployment

**Production: Vercel.** The app is one Vercel project with two Services, declared in the root `vercel.json`:

- `api` (root `apps/api`), whose build command runs the database migrations;
- `web` (root `apps/web`), the static frontend, with a rewrite of every path to `index.html` so that client-side routes work.

The top-level rewrites send `/api/*` and `/about.json` to `api` and everything else to `web`. Both Services therefore answer on **one origin**, and `APP_URL`, `WEB_URL` and `CORS_ORIGINS` all hold that origin. `deploy.sh` triggers a production build by pushing an empty commit to `main` as the project owner.

One origin matters for the session cookie. During an OAuth connection the browser leaves for the provider and comes back to the API's callback. If the frontend and the API were on two different sites, the session cookie would be a third-party cookie for the frontend, browsers that block those would not keep it, and the callback would not know who is connecting.

**Docker Compose: the full stack on one machine.** `docker-compose.yml` starts PostgreSQL and one `api` container. The `Dockerfile` builds both apps and copies `apps/web/dist` next to the API; at start, `app.ts` sees `../web/dist` and serves it as static files, with `index.html` as the fallback for client-side routes. The container runs the migrations, then listens on port 8080 with `NODE_ENV=production`. Docker Compose is not what runs in production.

**Local development.** The API runs with `bun --watch` on port 8080 and the frontend with the Vite dev server on port 5173. `apps/web/vite.config.ts` proxies `/api` to the API, and `/auth` to the API's `/api/auth`, so the browser still talks to one origin.

Environment variables are listed in the [Configuration section of the README](../README.md#configuration).
