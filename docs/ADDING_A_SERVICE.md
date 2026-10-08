# How to add a service

A **service** is an external integration (NASA, GitHub, Radio Browser…). It has one
**auth kind** and one or more **widgets**. A widget is one card on the dashboard: it
fetches data from the service and draws it.

Adding one touches two places, and nothing else:

| Where | What | Files |
|---|---|---|
| `apps/api` | how to fetch the data | one definition file, plus one line in `definitions/index.ts` |
| `apps/web` | how to draw it | one folder per widget, plus one entry in `widgetRegistry.tsx` |

The catalog (`GET /api/catalog`), `/about.json`, the "Add widget" form, validation,
caching, subscriptions and the Connect / API key buttons all come from the definition.
You never edit them.

1. [General: any new service](#1-general-any-new-service)
2. [GitHub: a new widget or service on the GitHub account](#2-github-a-new-widget-or-service-on-the-github-account)
3. [A new OAuth provider (Spotify, Google…)](#3-a-new-oauth-provider-spotify-google)
4. [Checking that it works](#4-checking-that-it-works)

---

## 1. General: any new service

### Step 1: pick the auth kind

| `auth.kind` | When | What the user does | What `fetch()` gets |
|---|---|---|---|
| `none` | public API, no key | nothing | `ctx.http` |
| `apiKey` | the API wants a key or token the user pastes | clicks **API key** on the card, fills the fields | `ctx.http`, `ctx.credentials` |
| `oauth2` | the user logs into their account at the provider | clicks **Connect**, accepts on the provider's page | `ctx.http`, `ctx.getAccessToken()` |

`oauth2` only works with a provider the API already knows (`services/oauth/ids.ts`, `github`
today). For a new one, see [section 3](#3-a-new-oauth-provider-spotify-google) first. How
the Connect flow, token storage and refresh work is in [HANDLING_OAUTH.md](HANDLING_OAUTH.md).

### Step 2: the backend definition

Create `apps/api/src/services/definitions/<name>.ts`. The commented reference is
`definitions/mock.ts`: read it once, it explains every field. A minimal service:

```ts
import type { ServiceDef } from '../types'
import { WidgetFetchError } from '../types'

export const weatherService: ServiceDef = {
    id: 'weather',          //stored in the database: never rename it once used
    name: 'Weather',        //shown to users
    auth: { kind: 'none' },
    widgets: [
        {
            id: 'forecast',  //unique inside the service, also stored in the database
            name: 'Forecast',
            description: 'The next days of weather for a city',
            params: [
                { name: 'city', label: 'City', type: 'string', required: true },
                { name: 'days', label: 'Days', type: 'integer', min: 1, max: 7, default: 3 },
            ],
            refresh: { default: 1800, min: 600 }, //seconds
            async fetch(ctx, params) {
                const body = await ctx.http.json<{ daily?: unknown[] }>(
                    `https://api.example.com/forecast?city=${encodeURIComponent(String(params.city))}`,
                )
                if (!Array.isArray(body.daily))
                    throw new WidgetFetchError('upstream_error', 'Weather: unexpected body')
                return { city: params.city, days: body.daily.slice(0, Number(params.days)) }
            },
        },
    ],
}
```

Then register it in `definitions/index.ts`: one import, and add it to `services` (every
environment) or `devOnlyServices` (never in production, for test fixtures).

The rules that matter:

- **`params`**: only `string` and `integer`. They are validated before `fetch()` runs:
  required fields, `min` / `max`, defaults filled in. So `fetch()` never has to check them
  again, and never has to clamp a value.
- **`refresh.min`** is also how long a successful result is cached. No user can make the
  API call the upstream more often than that. Pick it from the upstream's rate limits.
  The registry refuses `min < 5` and `min > default` at boot.
- **Always use `ctx.http.json(url, init)`**, never the global `fetch`. It has a 10 s timeout
  and turns HTTP errors into the right codes: 401 / 403 → `needs_reauth`,
  429 → `rate_limited`, anything else → `upstream_error`.
- **Check the shape of the response** and throw `WidgetFetchError('upstream_error', ...)`
  when it's not what you expect. Return only what the widget draws, not the whole upstream body.
- **Errors are thrown, not returned.** Throw `WidgetFetchError(code, message)` with one of
  `needs_reauth`, `rate_limited`, `upstream_error`, `invalid_config`. The data endpoint turns
  it into `{ ok: false, code }`, and the card shows the matching message. Any other exception
  becomes `upstream_error` and is logged.

For an **`apiKey`** service, declare the fields the user must give. They use the same shape
as params:

```ts
auth: {
    kind: 'apiKey',
    fields: [{ name: 'apiKey', label: 'API key (from example.com/account)', type: 'string', required: true }],
},
// in fetch():
const key = String(ctx.credentials?.apiKey)
```

The key is stored encrypted, never sent back to the browser, and `fetch()` is not even
called until the user has given one.

#### Actions: things the user triggers (optional)

A widget shows data on a timer. An **action** goes the other way: something the user does on
demand, like starring a repository or reporting a play. Declare them next to `widgets`:

```ts
actions: [
    {
        id: 'ping',
        name: 'Ping',
        description: 'Sends a message and gets it back with a timestamp',
        params: [{ name: 'message', label: 'Message to send back', type: 'string', required: true }],
        rateLimit: { max: 5, windowSeconds: 60 },
        async run(ctx, params) {
            return { message: String(params.message), timestamp: new Date().toISOString() }
        },
    },
],
```

There is no route to write. One route runs every action of every service:
`POST /api/services/:serviceId/actions/:actionId` with the body `{ "params": { ... } }`.

- **`params`** follow the same rules as widget params and are validated before `run()`.
  Bad input is a 400 `INVALID_PARAMS`.
- **`rateLimit`** is optional: at most `max` calls per `windowSeconds`, counted per user and
  per action. The call over the limit gets a 429 with a `Retry-After` header and `run()` is
  not called. A call with invalid params still counts. Without `rateLimit` the action is not
  limited, so set one on anything that calls an upstream. The registry refuses at boot a
  `max` or `windowSeconds` that is not an integer ≥ 1.
- **`run()`** follows the same rules as `fetch()`: use `ctx.http`, and throw
  `WidgetFetchError`. `invalid_config` becomes a 400 `INVALID_PARAMS`; the other three codes
  become `200 { ok: false, code }`. On success the answer is `{ ok: true, data }`.
- **Nothing is cached.** Two identical calls run twice.
- **Only `none` services can run actions for now.** An action of an `apiKey` or `oauth2`
  service answers `{ ok: false, code: 'needs_reauth' }` without calling `run()`.

Actions are listed in `GET /api/catalog` under each service's `actions`; `/about.json` does
not mention them. The commented reference is `ping` in
`apps/api/src/services/definitions/mock.ts`.

### Step 3: the frontend widget

Create `apps/web/src/components/widgets/<service>/<widget>/` with two files. Copy
`widgets/github/notifications/` or `widgets/nasa/neows/`.

**`parse.ts`** checks the data the API sent and gives it a type. It throws when the
shape is unexpected; the card then shows "The service isn't responding right now".

```ts
export type ForecastData = { city: string; days: unknown[] }

export function parseForecast(raw: unknown): ForecastData {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error('Unexpected forecast data')
    }
    const { city, days } = raw as Record<string, unknown>
    if (typeof city !== 'string' || !Array.isArray(days)) {
        throw new Error('Unexpected forecast data')
    }
    return { city, days }
}
```

> ⚠ **Dates arrive as `Date` objects, not strings.** The Eden client turns every ISO date
> string in a response (`"2026-10-04T16:43:00Z"`) into a `Date`. A parser that requires
> `typeof x === 'string'` for a date rejects every item, and the widget only ever shows
> "The service isn't responding right now". Accept both. See `parseDate` in
> `widgets/github/notifications/parse.ts`.

**The component** receives `{ instance, params, data }`, where `data` is what `parse`
returned. It only draws. Fetching, polling, the spinner, the error messages and the
Connect / API key buttons are all done by `WidgetShell` around it.

```tsx
import type { WidgetViewProps } from '../../../widgetRegistry'
import type { ForecastData } from './parse'

export default function ForecastWidget({ data }: WidgetViewProps<ForecastData>) {
    return <p className="text-white">{data.days.length} days for {data.city}</p>
}
```

**Register it** in `components/widgetRegistry.tsx`, under the key `"<serviceId>/<widgetId>"`
(the backend ids, exactly):

```ts
const forecast = defineWidget({
    component: ForecastWidget,
    parse: parseForecast,
    defaultSize: { w: 4, h: 3 }, //grid units, 12 columns wide
    minSize: { w: 2, h: 2 },
})

const entries: Record<string, WidgetEntry> = {
    // ...
    'weather/forecast': forecast,
}
```

A widget with no entry shows "Widget not implemented yet". That's the sign of a typo in the key.

---

## 2. GitHub: a new widget or service on the GitHub account

The GitHub provider is already set up: OAuth App, env variables, callback route, token
storage and refresh, Connect / Reconnect buttons. A new GitHub feature is just a
definition, like any other service. Setting up the GitHub OAuth App itself (Redirect URIs,
env variables) is in [HANDLING_OAUTH.md, section 1](HANDLING_OAUTH.md#1-setting-up-a-provider-app-github).

You have two options.

### Option A: add a widget to the existing `github` service (usually what you want)

The widget shares the user's existing GitHub connection: connect once, every GitHub
widget works. Add it to the `widgets` array of `apps/api/src/services/definitions/github.ts`.

Example: the user's most recently pushed repositories.

```ts
{
    id: 'repos',
    name: 'Repositories',
    description: 'Your most recently pushed repositories',
    params: [{ name: 'limit', label: 'How many to show', type: 'integer', min: 1, max: 20, default: 5 }],
    refresh: { default: 600, min: 300 },
    async fetch(ctx, params) {
        if (!ctx.getAccessToken)
            throw new WidgetFetchError('needs_reauth', 'GitHub: no account connected')
        const token = await ctx.getAccessToken() //refreshes the token first if it is about to expire

        const body = await ctx.http.json<unknown>(
            `https://api.github.com/user/repos?sort=pushed&per_page=${Number(params.limit)}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            },
        )
        if (!Array.isArray(body))
            throw new WidgetFetchError('upstream_error', 'GitHub: unexpected body')

        return {
            repos: body.map((repo) => ({
                name: String(repo.full_name),
                url: String(repo.html_url),
                stars: Number(repo.stargazers_count ?? 0),
                pushedAt: String(repo.pushed_at ?? ''),
            })),
        }
    },
},
```

Then the frontend folder `widgets/github/repos/` and the entry `'github/repos'` in
`widgetRegistry.tsx`, as in [step 3](#step-3-the-frontend-widget). `pushedAt` is an ISO
date, so it reaches the browser as a `Date`: parse it like `updatedAt` in the
notifications widget.

GitHub specifics:

- **Always send the three headers above.** `Accept` and `X-GitHub-Api-Version` pin the
  response format, so a GitHub change can't silently break the parser.
- **Never put the token anywhere but the `Authorization` header.** Not in the URL, not in
  what `fetch()` returns, not in an error message. Error messages end up in the logs.
- **Mind the rate limit.** It's 5,000 requests per hour per user, shared by all their GitHub
  widgets. A `refresh.min` of a few minutes is plenty.
- **A 403 means `needs_reauth`.** `ctx.http` maps it that way, and the card asks the user to
  reconnect. GitHub also answers 403 for its "secondary" rate limit, so a widget polling
  very often could trigger a false Reconnect.

### Scopes: what the token is allowed to do

The `github` service asks for `scopes: ['notifications']`. A token without the right scope
gets less data, or an error:

- `/user/repos` without the `repo` scope only lists **public** repositories.
- Private repositories, private issues and so on need `repo`, which is read *and* write
  access to all of them.

The list of scopes is at
https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps.
Ask for the fewest you can: the user sees the list on GitHub's consent page.

**Adding a scope to an existing service doesn't upgrade the tokens already stored.** Users
who connected before keep their old token until they click **Reconnect**. Until then, the
new widget gets the restricted answer, or a 403, which makes the card ask them to reconnect.
That's acceptable, but say so in the merge request.

### Option B: a separate GitHub service

Use it when a feature needs a much bigger scope (for example `repo`) and you don't want to
force it on everyone who only wants notifications. Create a new definition file with its
own id and the same provider:

```ts
export const githubPrivateService: ServiceDef = {
    id: 'github_private',
    name: 'GitHub (private repositories)',
    auth: { kind: 'oauth2', provider: 'github', scopes: ['repo'] },
    widgets: [/* ... */],
}
```

Register it in `definitions/index.ts`. Nothing else is needed on the backend: the callback
URL is per **provider** (`/api/subscriptions/oauth/github/callback`), not per service, so
the same GitHub OAuth App and env variables serve it. Each service has its own
subscription, so the user connects it separately and gets a separate token with only that
service's scopes.

---

## 3. A new OAuth provider (Spotify, Google…)

Only needed once per provider. After that, its services are plain definitions, as in
section 2. Everything lives in `apps/api`. The steps below cover connecting services;
[HANDLING_OAUTH.md, section 4](HANDLING_OAUTH.md#4-adding-a-new-provider) has the same steps
plus the optional one for logging in with the new provider:

1. **`services/oauth/ids.ts`**: add the id to `OAUTH_PROVIDER_IDS`:
   `['github', 'spotify'] as const`. TypeScript then points at every place that has to
   handle it.

2. **`config/env.ts`**: add the provider to `env.oauth`:
   ```ts
   oauth: {
       github: oauthProvider('GITHUB'),
       spotify: oauthProvider('SPOTIFY'), //reads OAUTH_SPOTIFY_CLIENT_ID / OAUTH_SPOTIFY_CLIENT_SECRET
   },
   ```
   Add `spotify: null` to `oauth` in **`config/env.fakes.ts`**, or the tests stop compiling.
   Document the two variables in **`apps/api/.env.example`** and the README.

3. **`services/oauth/providers.ts`**: write the adapter and add it to `factories`. Also
   add an entry to `loginFactories`: `() => null` if the provider isn't used to log in. Use
   the matching class from [arctic](https://arcticjs.dev/), which already has one for
   most providers. Copy `createGitHubProvider`:
   ```ts
   function createSpotifyProvider(config: OAuthClientConfig): OAuthProvider {
       const client = new Spotify(config.clientId, config.clientSecret, callbackUrl('spotify'))
       return {
           id: 'spotify',
           pkce: true, //true when the arctic class takes a codeVerifier
           authorizationUrl: (state, codeVerifier, scopes) => client.createAuthorizationURL(state, codeVerifier, scopes),
           async exchangeCode(code, codeVerifier) { /* validateAuthorizationCode → toCredentials */ },
           async refresh(refreshToken) { /* refreshAccessToken → toCredentials */ },
           async revoke(accessToken) { /* if the provider has a revocation endpoint */ },
       }
   }
   ```
   Things to check in the provider's docs:
   - **PKCE.** If the arctic class takes a `codeVerifier`, set `pkce: true` and pass it
     through. The routes generate and check it for you.
   - **Scope separator.** GitHub separates scopes with commas, most providers with spaces.
     Give `toCredentials` the right split function.
   - **Token lifetime.** `toCredentials` reads `expires_in` and `refresh_token`. Most
     providers send both: refreshing is then automatic.
   - **Error codes.** If the provider answers a dead refresh token with something else than
     `invalid_grant`, add that code to `PERMANENT_CODES` in **`services/oauth/errors.ts`**.
     Otherwise users see "not responding" instead of **Reconnect**.

4. **Register an app** at the provider, with this redirect / callback URL:
   `APP_URL` + `/api/subscriptions/oauth/<provider>/callback`. It must match exactly.
   Local and production usually need separate apps. See
   [HANDLING_OAUTH.md, section 1](HANDLING_OAUTH.md#1-setting-up-a-provider-app-github) for
   how it's done for GitHub.

5. Then write services with `auth: { kind: 'oauth2', provider: 'spotify', scopes: [...] }`,
   as in section 2.

Until its env variables are set, the provider counts as "not configured". The API still
boots, the catalog shows its services with `available: false`, and their Connect button is
disabled. That's intentional, so nobody needs every provider's secrets to run the project.

---

## 4. Checking that it works

```sh
docker compose up --build
```

1. **Boot**: if the API refuses to start, the registry's error message names the service
   and the field (duplicate id, `min > max`, `refresh.min` below 5, unknown OAuth
   provider…).
2. **Catalog**: http://localhost:8080/about.json lists the new service and widgets.
3. **Add the widget** from the dashboard. The form fields come from `params`.
4. **Auth**: with `apiKey`, the card shows **API key**. With `oauth2`, it shows **Connect**,
   which goes through the provider and back to the dashboard with a green "… is connected".
   If it comes back with an error instead, the `?oauth_error=` codes are listed in
   [HANDLING_OAUTH.md, section 2](HANDLING_OAUTH.md#2-connecting-a-service-with-oauth).
5. **The data**:
   - "Widget not implemented yet": the key in `widgetRegistry.tsx` doesn't match
     `serviceId/widgetId`.
   - "The service isn't responding right now", and nothing in the API logs: either
     `fetch()` threw `upstream_error`, or `parse.ts` rejected the data. Check dates first
     (see the warning in step 3). To see what the API actually sent, open the browser's
     network tab and look at `GET /api/dashboard/instances/<id>/data`.
   - "This service needs to be reconnected": the upstream answered 401 / 403. Check the key,
     or the token's scopes.
