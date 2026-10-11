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
| react-grid-layout | Drag, resize and collision handling of the dashboard cards (behaviour only, no components) |
| MapLibre GL | Globe of the Radio Browser station map widget |
| Vitest + Testing Library | Unit and component tests, run in jsdom |
| Biome | Linter, formatter and import sorting |

## Project structure

```
src/
├── api.ts                  # Eden client — typed bridge to the backend
├── auth.tsx                # AuthProvider context (login, logout that empties the query cache, session persistence)
├── App.tsx                 # Root component — AuthProvider + router; AppRoutes holds the route table
├── main.tsx                # Entry point — QueryClientProvider + App + global CSS
├── index.css               # Tailwind v4 import (@import "tailwindcss"), theme tokens, grid library overrides
├── preferences.ts          # Preferences kept in localStorage and mirrored as attributes on <html>
├── theme.ts                # useTheme: light or dark
├── textSize.ts             # useTextSize: small, default, large or extra large
├── components/
│   ├── ProtectedRoute.tsx  # Private pages: redirects to /login when no session exists
│   ├── GuestRoute.tsx      # Login and register: redirects to /dashboard when a session exists
│   ├── layout/
│   │   └── AppShell.tsx        # Top bar (app name, page action, account menu) + <main>
│   ├── WidgetGrid.tsx      # 12-column drag-and-resize grid (single column on phones), one WidgetShell per instance
│   ├── widgetRegistry.tsx  # Maps "serviceId/widgetId" to a component, a parser and sizes
│   ├── dashboard/          # The widget base
│   │   ├── types.ts            # Instance, catalog and body types, derived from the Eden client
│   │   ├── queries.ts          # TanStack Query hooks (instances, catalog, create/update/delete, layout, set key, disconnect)
│   │   ├── useWidgetData.ts    # Fetches and polls one instance's data
│   │   ├── WidgetShell.tsx     # Card around every widget: title, actions, loading and error states
│   │   ├── WidgetErrorBoundary.tsx
│   │   ├── AddWidgetDialog.tsx / EditWidgetDialog.tsx / ConfirmDialog.tsx
│   │   ├── InstanceForm.tsx    # Title + refresh + params form shared by add and edit
│   │   ├── ParamForm.tsx       # One field per param declared in the catalog
│   │   ├── validateParams.ts   # Client-side check of those params (required, integer, min/max)
│   │   ├── CatalogLoader.tsx   # Loading / error wrapper around the catalog query
│   │   ├── ApiKeyDialog.tsx    # Sets or replaces the API key of one service
│   │   ├── ConnectButton.tsx   # Starts the OAuth connection of one service
│   │   ├── OAuthNotice.tsx     # Result of an OAuth connection, read from ?connected= / ?oauth_error=
│   │   ├── useMediaQuery.ts    # Whether a CSS media query matches, kept up to date
│   │   └── layout.ts           # Grid maths: sort, compact, pack, move, next free slot
│   ├── ui/                 # Alert, Button, Dialog, Field, Input, Menu, RadioGroup, Spinner
│   └── widgets/            # One folder per service, one subfolder per widget
│       ├── AdviceWidget.tsx            # legacy widget (fetches for itself)
│       ├── LetterboxdWidget.tsx        # legacy widget (fetches for itself)
│       ├── epic-games/free-games/
│       ├── facts/fact-of-the-day/
│       ├── github/contributions/
│       ├── github/notifications/
│       ├── mock/echo/
│       ├── nasa/apod/
│       ├── nasa/neows/
│       ├── pokemon-tcg/booster-opener/
│       ├── radio-browser/station-map/
│       ├── random_fox/random_fox/
│       └── spotify/recently-played/
├── pages/
│   ├── Register.tsx        # Account creation form → "check your email" message, links to /login
│   ├── Login.tsx           # Login form → useAuth().login() → redirects to /dashboard, links to /register
│   ├── VerifyEmail.tsx     # Target of the link in the verification email
│   ├── Dashboard.tsx       # AppShell + WidgetGrid + add / edit / delete dialogs
│   ├── Profile.tsx         # Account info, delete account + the credentials of every service (keys, connections)
│   └── Settings.tsx        # Text size and theme
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
5. **Logout** — "Log out" in the account menu calls `POST /api/auth/logout`, which clears the cookie. `useAuth().logout()` then empties the TanStack Query cache, so the next user of the same tab never sees the previous user's widgets, and the app goes to `/login`. `login()` empties it as well, for a request that answered after the logout. When the logout fails, the user stays logged in and the page shows "Couldn't log out." with the reason.

The three pages are built with `ui/Field`, `ui/Input` and `ui/Button`, and link to each other. A failure is shown in a `ui/Alert` above the fields with the API's own message (`Invalid email or password`, `Verify your email before logging in`, `An account with this email already exists`), or "Couldn't reach the dashboard server." when the request got no answer. The submit button is disabled while a request is pending.

The session cookie is `httpOnly` — JavaScript cannot read it, which protects against XSS attacks.

## Navigation

There is no global nav. What a visitor sees depends on the session:

- **Logged out** — only the auth pages, with no bar. They link to each other ("Sign up" / "Log in").
- **Logged in** — every page is wrapped in `AppShell`, which draws one top bar: the app name (a link to `/dashboard`), the action of the current page, and the account menu.

The account menu is a round avatar with the first letter of the user's email. It opens a `ui/Menu` showing the full email, **Profile** (`/profile`), **Settings** (`/settings`) and **Log out**. `/settings` holds the text size and the theme.

A page owns its action: it passes its buttons through the `actions` prop and the bar knows nothing about them.

```tsx
<AppShell actions={<Button onClick={() => setAdding(true)}>Add Widget</Button>}>
    ...
</AppShell>
```

On narrow screens the bar stays on one row: the app name is cut with an ellipsis, the action and the avatar keep their size, and the menu panel never gets wider than the screen.

`ui/Menu` is hand-made, with no dependency. It opens on click, Enter or Space and focuses its first item; the arrow keys, Home and End move between items; Enter or Space chooses one; Escape closes it and returns the focus to the trigger; a press outside, the focus leaving (Tab), or choosing an item closes it too.

## Profile page

`/profile` has two sections.

- **Account** — the email and "Member since <date>" (day/month/year), both from `useAuth()`. A "Delete account" button asks for confirmation, then calls `DELETE /api/auth/me`, which removes the account with its widgets, connections and saved keys.
- **Services** — one row per catalog service that needs credentials (`auth.kind` `apiKey` or `oauth2`), connected or not, in catalog order. The list comes from `GET /api/catalog`, so a new service or provider appears without touching the page. Services with `auth.kind: 'none'` are not listed.

| `auth.kind` | `subscription` | Status | Actions |
|---|---|---|---|
| `apiKey` | `null` | No key | Set key |
| `apiKey` | `active` | Key set | Replace key, Remove key |
| `apiKey` | `needs_reauth` / `revoked` | Key rejected | Replace key, Remove key |
| `oauth2` | `null` | Not connected | Connect |
| `oauth2` | `active` | Connected | Reconnect, Disconnect |
| `oauth2` | `needs_reauth` / `revoked` | Needs reconnecting | Reconnect, Disconnect |

"Set key" / "Replace key" open `ApiKeyDialog`, which takes a `serviceId` (the dashboard passes the service of the card that was clicked). "Connect" / "Reconnect" are `ConnectButton`; it is disabled, with an explanation, when the server has no credentials for the provider, and "Disconnect" still works then. Every row button carries the service in its accessible name (`aria-label="Disconnect GitHub"`, `"Replace key for NASA"`).

"Remove key" / "Disconnect" ask for confirmation first, saying how many of the user's widgets belong to the service. `useDisconnectService()` then calls `DELETE /api/subscriptions/:service`. On success it refreshes the catalog and **removes** the cached data of that service's widgets, so that back on the dashboard they show the "Connect" / "Set API key" prompt instead of their last data. A 404 (already disconnected, from another tab) is treated as a success. The dialog stays busy until the refreshed catalog is on screen, and the keyboard focus then moves to the row's remaining button. The widgets themselves are kept.

After connecting an account from this page the browser lands on `/dashboard`, where the result is shown: that is where the API's OAuth callback redirects.

## Route protection

| Route | Wrapper | Logged out | Logged in |
|---|---|---|---|
| `/login`, `/register` | `GuestRoute` | the form | redirect to `/dashboard` |
| `/verify-email` | none | the page | the page |
| `/dashboard`, `/profile`, `/settings` | `ProtectedRoute` | redirect to `/login` | the page |
| `/` and any unknown address | `ProtectedRoute` around a redirect | redirect to `/login` | redirect to `/dashboard` |

Both wrappers read `useAuth()`. While `loading` (the answer of `GET /api/auth/me` has not arrived) they show a `ui/Spinner` and nothing else, so neither a form nor the bar flashes. Every redirect uses `replace`, and so do the navigations after a login and a logout, so the Back button never returns to a page that would redirect again. There is no 404 page.

The address is kept while the session loads, so the return of an OAuth connection (`/dashboard?connected=github`) still reaches the dashboard with its query string.

## Dashboard & widget base

### Grid

`WidgetGrid` is a 12-column grid with 96 px rows and 16 px gaps. Each instance stores its own `x`, `y`, `w` and `h`, and from the `md` breakpoint (768 px) up these are real positions: a card sits in the column where it was left, and cards float up so there are never vertical holes.

From 768 px up the grid is drawn by [`react-grid-layout`](https://github.com/react-grid-layout/react-grid-layout) (pinned to `2.2.4`). It only handles the behaviour (dragging, resizing, collisions, the drop placeholder and the resize handle); every card, button and dialog is still our own code.

- **Move:** drag a card by its header. Buttons, links and form fields in the header never start a drag, and nothing inside the widget body does either.
- **Resize:** drag the bottom-right corner. The size snaps to whole cells, never goes below the widget's `minSize` (from `widgetRegistry.tsx`), and never above 12 columns or 12 rows (`GRID_COLUMNS`, `MAX_ROWS` in `layout.ts`).
- **Save:** one `PATCH /api/dashboard/layout` when the pointer is released, holding only the cards whose position or size differs from what is stored. Nothing is sent on page load, on a window resize, or for a drop that changes nothing. The save is optimistic: if the API refuses it, the cards go back and an alert says so.

Below 768 px there is no library: the cards are a single column ordered by `y`, then `x`, with no drag and no resize.

Every card also has two buttons, **Move earlier** and **Move later**. They are visible below 768 px, where they are the only way to reorder. From 768 px up they are hidden until a keyboard user tabs to them. A press swaps the card with its neighbour in reading order and re-flows the whole dashboard left to right (`move` and `pack` in `layout.ts`), so a layout arranged by hand is replaced by a gap-free flow. Keyboard users resize with the Width and Height fields of the Edit dialog.

`layout.ts` holds the maths, with no React in it:

| Function | What it does | Used by |
|---|---|---|
| `compact(items)` | closes vertical holes and resolves overlaps downward, with the same compactor the grid uses; a card keeps its column | delete, the Edit dialog, `nextSlot` |
| `nextSlot(items, size)` | where a new card goes: bottom left, floating up if there is room | the Add dialog |
| `move(items, id, 'earlier' \| 'later')` | swaps a card with its neighbour in reading order | the move buttons |
| `pack(items)` | re-flows every card left to right, top to bottom | `move` only |
| `layoutChanges(before, after)` | the cards whose `x`, `y`, `w` or `h` changed | every save |

The library's stylesheet is imported once in `main.tsx`, before `index.css`, which overrides the drop placeholder (project blue instead of red) and the resize chevron (light, always visible).

Known limits: drag and resize on the card need a pointer (mouse or touch); crossing the 768 px breakpoint (rotating a tablet, resizing the window) swaps one layout for the other and mounts every widget again, so state kept inside a widget, such as a playing radio station, is lost; a dashboard saved before this change can hold a card with a hole above it, which the grid shows floated up and stores the next time something is dropped, while the move buttons keep working from the stored order until then; the layout is the same at every width from 768 px up, so there is one layout per dashboard, not one per screen size; the API does not validate layouts, so the minimum size, the 12 columns and the no-overlap rule are frontend rules.

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

A new widget is placed at the bottom left of the dashboard and floats up if the columns above it are free. Changing the width or height in the Edit dialog only pushes down the cards under the one that grew (or lets them float up when it shrank); the rest of the dashboard stays where it is. Deleting a widget lifts the cards under it and moves nothing else.

### Widget shell

Every widget is drawn inside `WidgetShell`, which owns everything that is not specific to one widget:

- title bar with refresh, edit, move earlier / later and delete actions, and the time of the last fetch; from 768 px up the bar is also the handle the card is dragged by
- an **API key** button in the bar for a widget of an `apiKey` service, and a **Connect** / **Reconnect** button for a widget of an `oauth2` service
- data fetching and polling every `refreshSeconds` (`useWidgetData`)
- a spinner on first load, and a small indicator while refreshing
- one message per error code the API can answer with (`rate_limited`, `upstream_error`, `invalid_config`, `needs_reauth`), plus a network error
- when a refresh fails, the last good data stays on screen with a "Refresh failed" note
- an error boundary, so a widget that throws does not take the dashboard down

A widget of an `apiKey` or `oauth2` service has no data until its service is connected: the API answers `needs_reauth`, and the shell shows a prompt in place of the widget. For an `apiKey` service the prompt is "Set API key", which opens `ApiKeyDialog`; saving the key calls `POST /api/subscriptions/:service` and the widget loads. For an `oauth2` service it is `ConnectButton` ("Connect", or "Reconnect" when a subscription already exists), which sends the browser to `GET /api/subscriptions/:service/authorize`; the provider sends it back to `/dashboard?connected=<service>`, where `OAuthNotice` shows the result. The button is disabled, with an explanation, when the server has no credentials for the provider. The same key or connection serves every widget of that service, and the Profile page manages them all in one place.

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

A widget with no entry in the registry falls back to a "Widget not implemented yet" placeholder. `AdviceWidget` and `LetterboxdWidget` are still legacy entries: they fetch and poll for themselves instead of going through the shell.

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

Tests run in jsdom with Testing Library. `src/test/apiMock.ts` is a stand-in for the Eden client and `src/test/renderWithQuery.tsx` renders a component inside a fresh `QueryClient`. `AuthProvider` needs that query client around it. jsdom lays nothing out and has no `matchMedia`, so `src/test/setup.ts` adds a `matchMedia` in which no query matches (tests get the single-column dashboard unless they stub it), and the tests of the wide dashboard replace `react-grid-layout` with a stand-in that renders its children and exposes its props; real dragging is not simulated. `App.test.tsx` renders the exported `AppRoutes` inside a `MemoryRouter` to test the redirects.

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
