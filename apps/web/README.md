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
| React Router | Client-side routing |

## Project structure

```
src/
├── api.ts                  # Eden client — typed bridge to the backend
├── auth.tsx                # AuthProvider context (login, logout, session persistence)
├── App.tsx                 # Root component — routing + AuthProvider wrapper
├── main.tsx                # Entry point — renders App + imports global CSS
├── index.css               # Tailwind v4 import (@import "tailwindcss")
├── components/
│   ├── ProtectedRoute.tsx  # Redirects to /login when no session exists
│   └── WidgetGrid.tsx      # Responsive CSS Grid that renders widget cards
└── pages/
    ├── Register.tsx         # Account creation form → POST /auth/register
    ├── Login.tsx            # Login form → uses useAuth().login() → redirects to /dashboard
    └── Dashboard.tsx        # Main page — header (email + logout) + WidgetGrid
```

## How it connects to the backend

The frontend never calls `fetch` directly. Instead it uses **Eden Treaty**, which creates a typed client from the backend's exported `App` type:

```ts
import { treaty } from '@elysiajs/eden'
import type { App } from '../../api/src/app'

export const api = treaty<App>('http://localhost:5173')
```

This is possible because the project is a **Bun monorepo** — the frontend can import types from `apps/api` directly, with no code generation step.

### Dev proxy

In development, frontend (port 5173) and backend (port 8080) run on different origins. The Vite dev proxy forwards API calls to the backend transparently:

```ts
// vite.config.ts
server: {
  proxy: {
    "/api": "http://localhost:8080",
    "/auth": { target: "http://localhost:8080", rewrite: (path) => `/api${path}` }
  }
}
```

In production this is unnecessary — the backend serves the compiled frontend from `web/dist`.

## Authentication flow

1. **Register** — `POST /auth/register` creates the account.
2. **Verify email** — The backend prints a verification token to the console (dev mode). Confirm with `POST /api/auth/verify-email`.
3. **Login** — `POST /auth/login` sets an `httpOnly` session cookie and returns the user object.
4. **Session persistence** — On page load, `AuthProvider` calls `GET /auth/me`. The browser sends the cookie automatically; if valid, the user stays logged in.
5. **Logout** — `POST /auth/logout` clears the cookie.

The session cookie is `httpOnly` — JavaScript cannot read it, which protects against XSS attacks.

## Route protection

`ProtectedRoute` wraps private pages (e.g. `/dashboard`). It checks `useAuth()`:

- `loading` → shows "Loading…"
- `user === null` → redirects to `/login`
- `user` exists → renders the page

## Dashboard & widget grid

The dashboard renders a responsive CSS grid (`1 col → 2 cols → 3 cols`) of widget instance cards. Each card shows its type, configuration and refresh rate. Users can delete widgets; the "Add Widget" button will open a configuration modal (in progress).

Widget instances follow this shape:

```ts
type WidgetInstance = {
  id: string
  type: string                          // e.g. "weather_city"
  config: Record<string, string | number> // e.g. { city: "Madrid" }
  refreshRate: number                    // seconds
}
```

## Run locally

```sh
# From the repo root
bun install
cd apps/web
bun run dev        # → http://localhost:5173
```

Make sure the backend is running on port 8080 (see root README).

## Build for production

```sh
cd apps/web
bun run build      # outputs to dist/
```

The backend auto-detects `../web/dist` and serves the frontend on port 8080.