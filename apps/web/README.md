# Dashboard — Frontend (`apps/web`)

React single-page application that lets authenticated users build a personal dashboard with configurable, auto-refreshing widgets.

## Tech stack

| Technology | Role |
|---|---|
| React 19 | UI components |
| Vite 6 | Dev server (HMR) + production bundler |
| TypeScript | Type safety across the entire codebase |
| Tailwind CSS v4 | Utility-first styling (plugin mode, no config file) |
| Eden Treaty | Type-safe HTTP client — imports the backend's `App` type for end-to-end type safety |
| TanStack Query | Server state: fetching, caching, mutations and the per-widget refresh interval |
| React Router | Client-side routing |
| MapLibre GL | Globe of the Radio Browser station map widget |
| Vitest + Testing Library | Unit and component tests, run in jsdom |
| Biome | Linter, formatter and import sorting |

## Project structure

```
src/
├── api.ts                  # Eden client — typed bridge to the backend
├── auth.tsx                # AuthProvider context (login, logout, session persistence)
├── App.tsx                 # Root component — routing + AuthProvider wrapper
├── main.tsx                # Entry point — QueryClientProvider + App + global CSS
├── index.css               # Tailwind v4 import (@import "tailwindcss")
├── components/
│   ├── ProtectedRoute.tsx  # Redirects to /login when no session exists
│   ├── WidgetGrid.tsx      # 12-column grid, one WidgetShell per instance
│   ├── widgetRegistry.tsx  # Maps "serviceId/widgetId" to a component, a parser and sizes
│   ├── dashboard/          # The widget base
│   │   ├── types.ts            # Instance, catalog and body types, derived from the Eden client
│   │   ├── queries.ts          # TanStack Query hooks (instances, catalog, create/update/delete, layout)
│   │   ├── useWidgetData.ts    # Fetches and polls one instance's data
│   │   ├── WidgetShell.tsx     # Card around every widget: title, actions, loading and error states
│   │   ├── WidgetErrorBoundary.tsx
│   │   ├── AddWidgetDialog.tsx / EditWidgetDialog.tsx / ConfirmDialog.tsx
│   │   ├── InstanceForm.tsx    # Title + refresh + params form shared by add and edit
│   │   ├── ParamForm.tsx       # One field per param declared in the catalog
│   │   ├── validateParams.ts   # Client-side check of those params (required, integer, min/max)
│   │   ├── CatalogLoader.tsx   # Loading / error wrapper around the catalog query
│   │   └── layout.ts           # Grid maths: sort, pack, move, next free slot
│   ├── ui/                 # Alert, Button, Dialog, Field, Input, Spinner
│   └── widgets/            # One folder per service, one subfolder per widget
│       ├── AdviceWidget.tsx            # legacy widget (fetches for itself)
│       ├── mock/echo/
│       └── radio-browser/station-map/
├── pages/
│   ├── Register.tsx        # Account creation form → "check your email" message, links to /login
│   ├── Login.tsx           # Login form → useAuth().login() → redirects to /dashboard, links to /register
│   ├── VerifyEmail.tsx     # Target of the link in the verification email
│   └── Dashboard.tsx       # Header + WidgetGrid + add / edit / delete dialogs
└── test/                   # Vitest setup, Eden client mock, renderWithQuery helper
```

Tests live next to the file they cover, as `*.test.ts` / `*.test.tsx`.

## How it connects to the backend

The frontend never calls `fetch` directly. Instead it uses **Eden Treaty**, which creates a typed client from the backend's exported `App` type:

```ts
import { treaty } from '@elysiajs/eden'
import type { App } from '../../api/src/app'

const baseUrl = import.meta.env.VITE_API_URL || window.location.origin

export const api = treaty<App>(baseUrl, {
    fetch: { credentials: 'include' },
}).api
```

Every backend route lives under `/api`, so the client exposes that subtree: `api.auth.login.post()` is `POST /api/auth/login`.

This is possible because the project is a **Bun monorepo** — the frontend can import types from `apps/api` directly, with no code generation step. The types in `components/dashboard/types.ts` are derived from this client, so a change to a backend schema shows up as a type error here.

### Dev proxy

In development, frontend (port 5173) and backend (port 8080) run on different origins. `VITE_API_URL` is unset, so the client targets the page origin and the Vite dev proxy forwards API calls to the backend:

```ts
// vite.config.ts
server: {
    proxy: {
        '/api': 'http://localhost:8080',
        '/auth': {
            target: 'http://localhost:8080',
            rewrite: (path) => `/api${path}`,
        },
    },
}
```

### Production

Production runs on Vercel as one project with two [Services](https://vercel.com/docs/services), declared in the root `vercel.json` (`deploy.sh` at the repo root triggers a build of `main`): `web` serves this app, `api` answers `/api/*` and `/about.json`. Both share one origin, so `VITE_API_URL` stays unset and `APP_URL`, `WEB_URL` and `CORS_ORIGINS` all hold that origin. Keep it that way: on two different sites the session cookie becomes third-party, browsers drop it on the OAuth redirects, and connecting a service fails with "Your session ended before the connection finished".

Docker is not used in production. `docker compose up --build` is a way to run the whole stack on one machine: the image builds `apps/web` and the API serves `../web/dist` itself on port 8080. Same origin, so `VITE_API_URL` stays unset.

## Authentication flow

1. **Register** — `POST /api/auth/register` creates the account and sends a verification email. The form is then replaced by "Account created. Check your email to verify your address." and a link to `/login`.
2. **Verify email** — the link in the email opens `/verify-email?token=...`, which posts the token to `POST /api/auth/verify-email` once and offers a resend (`POST /api/auth/resend-verification`) when it is rejected. Without SMTP settings the API prints the email to its logs instead (see the root README).
3. **Login** — `POST /api/auth/login` sets an `httpOnly` session cookie and returns the user object. `useAuth().login()` resolves with nothing on success and throws the `ApiError` of a refused login.
4. **Session persistence** — on page load, `AuthProvider` calls `GET /api/auth/me`. The browser sends the cookie automatically; if valid, the user stays logged in. If the request gets no answer, `loading` still ends, with no user.
5. **Logout** — `POST /api/auth/logout` clears the cookie.

The three pages are built with `ui/Field`, `ui/Input` and `ui/Button`, and link to each other. A failure is shown in a `ui/Alert` above the fields with the API's own message (`Invalid email or password`, `Verify your email before logging in`, `An account with this email already exists`), or "Couldn't reach the dashboard server." when the request got no answer. The submit button is disabled while a request is pending.

The session cookie is `httpOnly` — JavaScript cannot read it, which protects against XSS attacks.

## Route protection

`ProtectedRoute` wraps private pages (e.g. `/dashboard`). It checks `useAuth()`:

- `loading` → shows "Loading…"
- `user === null` → redirects to `/login`
- `user` exists → renders the page

## Dashboard & widget base

### Grid

`WidgetGrid` is a 12-column CSS grid with 96 px rows and 16 px gaps; it collapses to a single column on narrow screens. Each instance stores its own `x`, `y`, `w` and `h`. Moving a widget left or right re-packs the grid (`layout.ts`) and saves only the instances whose position changed through `PATCH /api/dashboard/layout`.

### Widget instances

An instance is one configured widget on the user's dashboard. Its type comes from the API through Eden (`Instance` in `dashboard/types.ts`):

```ts
{
    id: string
    serviceId: string          // e.g. "radio_browser"
    widgetId: string           // e.g. "station_map"
    title: string
    params: Record<string, string | number>
    refreshSeconds: number
    x: number; y: number; w: number; h: number
    enabled: boolean
    createdAt: Date
    updatedAt: Date
}
```

### Adding and editing

`AddWidgetDialog` lists the services and widgets from `GET /api/catalog`. The form is generated from the params the catalog declares for the chosen widget, and validated on the client with the same rules as the backend (required, integer, `min` / `max`). `EditWidgetDialog` reuses the same form.

### Widget shell

Every widget is drawn inside `WidgetShell`, which owns everything that is not specific to one widget:

- title bar with refresh, move, edit and delete actions, and the time of the last fetch
- data fetching and polling every `refreshSeconds` (`useWidgetData`)
- a spinner on first load, and a small indicator while refreshing
- one message per error code the API can answer with (`rate_limited`, `upstream_error`, `invalid_config`, `needs_reauth`), plus a network error
- when a refresh fails, the last good data stays on screen with a "Refresh failed" note
- an error boundary, so a widget that throws does not take the dashboard down

### Adding a widget

1. Create `components/widgets/<service>/<widget>/` with a `parse.ts` and a component.
2. `parse(raw: unknown)` checks the data returned by the API and returns a typed value; it throws when the shape is unexpected.
3. The component receives `{ instance, params, data }`, where `data` is what `parse` returned. It only draws; it does not fetch.
4. Register it in `widgetRegistry.tsx` under the key `"serviceId/widgetId"`:

```ts
const echo = defineWidget({
    component: EchoWidget,
    parse: parseEcho,
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
})
```

A widget with no entry in the registry falls back to a "Widget not implemented yet" placeholder. `AdviceWidget` is still a legacy entry: it fetches and polls for itself instead of going through the shell.

## Run locally

```sh
# From the repo root
bun install
cd apps/web
bun run dev        # → http://localhost:5173
```

Make sure the backend is running on port 8080 (see root README).

## Tests

```sh
cd apps/web
bun run test       # vitest run
```

Tests run in jsdom with Testing Library. `src/test/apiMock.ts` is a stand-in for the Eden client and `src/test/renderWithQuery.tsx` renders a component inside a fresh `QueryClient`.

## Lint and format

```sh
cd apps/web
bun run check                 # lint + format + import order, report only
bun run lint                  # lint rules only
bun run format                # rewrite files with the formatter
bunx biome check --write .    # apply every safe fix
```

The rules are in `biome.json`: 4 spaces, single quotes, no semicolons, and `console.log` is an error (`console.error` and `console.warn` are allowed).

## Build for production

```sh
cd apps/web
bun run build      # type-checks with tsc, then outputs to dist/
```

When `../web/dist` exists next to a locally running API, the API also serves the frontend on port 8080.
