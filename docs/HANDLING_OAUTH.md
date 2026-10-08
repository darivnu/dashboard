# Handling OAuth

The API uses OAuth 2.0 for two different jobs. They share the provider setup, but
everything after the provider sends the user back is different:

| | Connecting a service | Logging in |
|---|---|---|
| What it's for | **authorization**: widgets read the user's data at the provider | **authentication**: the provider says who the user is |
| Who can start it | a logged-in user only | anyone |
| Started from | **Connect** / **Reconnect** on a widget card or the Profile page | **Continue with GitHub** on the login page |
| GitHub scopes | the service's `auth.scopes` (`notifications`) | `user:email` |
| The provider token | stored encrypted, refreshed, revoked on disconnect | used once to read the user's id and email, then dropped |
| What it creates | a `service_subscriptions` row | a session, plus an `auth_identities` row |
| Routes | `/api/subscriptions/:service/authorize` → `/api/subscriptions/oauth/:provider/callback` | `/api/auth/oauth/:provider` → `/api/auth/oauth/:provider/callback` |
| Back to | `WEB_URL/dashboard?connected=…` or `?oauth_error=…` | `WEB_URL/dashboard`, or `WEB_URL/login?oauth_error=…` |

The subject asks for both: authentication "with credentials … or via OIDC", and
authorization "via OAuth 2.0", linking "the third-party account to an existing platform
user". GitHub is the only provider today (`services/oauth/ids.ts`).

1. [Setting up a provider app (GitHub)](#1-setting-up-a-provider-app-github)
2. [Connecting a service with OAuth](#2-connecting-a-service-with-oauth)
3. [Logging in with OAuth](#3-logging-in-with-oauth)
4. [Adding a new provider](#4-adding-a-new-provider)
5. [Rules that apply to both](#5-rules-that-apply-to-both)
6. [Checking that it works](#6-checking-that-it-works)
7. [Known limitations and what could be done better](#7-known-limitations-and-what-could-be-done-better)

---

## 1. Setting up a provider app (GitHub)

One GitHub **OAuth App** serves both flows, with one pair of env variables.

1. Go to https://github.com/settings/developers → **OAuth Apps** → **New OAuth App** (or
   open the existing one). For an app owned by an organization:
   `https://github.com/organizations/<org>/settings/applications`.
2. **Homepage URL**: shown to users only. The frontend URL is a good choice
   (`http://localhost:5173` locally).
3. Under **Redirect URIs**, add these two:

   | Redirect URI | Used by |
   |---|---|
   | `${APP_URL}/api/subscriptions/oauth/github/callback` | connecting the GitHub service |
   | `${APP_URL}/api/auth/oauth/github/callback` | logging in with GitHub |

   Locally `APP_URL` is `http://localhost:8080`, so:
   `http://localhost:8080/api/subscriptions/oauth/github/callback` and
   `http://localhost:8080/api/auth/oauth/github/callback`.

4. Leave **Allow wildcard matching** unchecked. Without it, GitHub only redirects to a
   URI that matches one of the list exactly. With it, GitHub would send codes to any path
   under the URI, which is exactly what the warning on that page is about. A missing or
   mistyped URI shows GitHub's page "The redirect_uri is not associated with this
   application".
5. Copy the **Client ID**, generate a **Client secret**, and put them in `apps/api/.env`
   (in production: the Vercel env of the API):
   ```
   OAUTH_GITHUB_CLIENT_ID=...
   OAUTH_GITHUB_CLIENT_SECRET=...
   ```

Local and production need **separate apps**, because the Redirect URIs contain `APP_URL`.

**Both variables unset** means the provider is "not configured", and that's allowed: the
API still boots, the catalog shows GitHub services with `available: false` (their Connect
button is disabled), and the login routes answer 404. **Only one of the two set** stops the
boot (`oauthProvider()` in `config/env.ts`), because that's always a mistake.

The `redirect_uri` the API sends is built from `APP_URL` (`callbackUrl()` and
`loginCallbackUrl()` in `services/oauth/providers.ts`). If `APP_URL` is wrong, the
Redirect URIs can be right and GitHub still refuses.

---

## 2. Connecting a service with OAuth

### Declaring it

A service connects through OAuth when its definition says so:

```ts
auth: { kind: 'oauth2', provider: 'github', scopes: ['notifications'] },
```

Nothing else is needed for a provider that already exists. How to write the service
and its widgets, the `ctx.getAccessToken()` call in `fetch()`, scopes and GitHub's API
rules are in [ADDING_A_SERVICE.md, section 2](ADDING_A_SERVICE.md#2-github-a-new-widget-or-service-on-the-github-account).

### The flow

```
Connect button ── window.location ──▶ GET /api/subscriptions/:service/authorize
   │                    • not logged in / unknown service / not oauth2 / provider not configured
   │                      → 302 WEB_URL/dashboard?oauth_error=<code>
   │                    • Set-Cookie oauth_pending = encrypt({ state, codeVerifier, serviceId, userId, createdAt })
   │                    • 302 → provider consent page (state, scopes, redirect_uri)
   ▼
provider (user approves)
   │
   ▼
GET /api/subscriptions/oauth/:provider/callback?code=…&state=…
                        • clear oauth_pending first (one shot)
                        • state matches, < 10 min, no ?error=, same user as at the start
                        • code → tokens (provider.exchangeCode)
                        • upsert service_subscriptions(user, service) with the tokens, encrypted, status active
                        • 302 → WEB_URL/dashboard?connected=<service>
any failure → 302 → WEB_URL/dashboard?oauth_error=<code>
```

The frontend side is `ConnectButton.tsx` (navigates to `connectUrl()` from `api.ts`) and
`OAuthNotice.tsx` (reads `?connected` / `?oauth_error` on the dashboard, shows the
message, removes the param).

### Where the pieces live

| File | Does |
|---|---|
| `modules/subscriptions/subscriptions.routes.ts` | the two routes; turns every failure into a redirect |
| `modules/subscriptions/subscriptions.service.ts` | `startOAuth` / `finishOAuth` (state, expiry, user checks), `OAuthFlowError` and its codes, `unsubscribe` / `revokeAll` |
| `services/oauth/providers.ts` | `OAuthProvider` adapters (`createGitHubProvider`), `getProvider()`, `callbackUrl()` |
| `services/oauth/tokens.ts` | the token manager behind `ctx.getAccessToken()`: refreshes a token about to expire |
| `services/oauth/errors.ts` | which provider errors mean "reconnect", and safe descriptions for the logs |
| `plugins/session.ts` | `oauth_pending` cookie options |

### The token's life

- **Stored**: in `service_subscriptions.credentials`, encrypted with `MASTER_KEY`
  (AES-256-GCM, `lib/crypto.ts`), as `{ accessToken, refreshToken, expiresAt, scopes }`.
  Never returned by any route: the response schemas don't have the field.
- **Used**: a widget's `fetch()` calls `ctx.getAccessToken()`. GitHub OAuth App tokens never
  expire. For providers whose tokens do, the token manager refreshes them a minute early,
  once even when several widgets ask together (shared promise in the instance, row lock
  across instances).
- **Dead**: a refresh refused with `invalid_grant` (GitHub: `bad_refresh_token`), or a
  401 / 403 from the API, makes the card show **Reconnect**. Connecting again replaces the
  tokens and sets the subscription back to `active`.
- **Revoked**: disconnecting the service (`DELETE /api/subscriptions/:service`) and deleting
  the account both call `provider.revoke()`. It runs after the database delete and never
  blocks it: a provider that can't be reached only gets logged. For GitHub it deletes the
  whole **grant** (`DELETE /applications/{client_id}/grant`), so the next Connect shows the
  consent page again.

### Error codes (`?oauth_error=` on `/dashboard`)

`unauthorized`, `unknown_service`, `not_oauth`, `not_configured`, `invalid_state`,
`expired`, `denied`, `provider_error`, `session_mismatch`, `exchange_failed`. Each has a
message in `OAuthNotice.tsx`. The list is `OAuthErrorCode` in `subscriptions.service.ts`.

---

## 3. Logging in with OAuth

### The flow

```
Continue with GitHub ── window.location ──▶ GET /api/auth/oauth/github
   │                    • unknown provider or not configured → 404 (JSON, only on a misconfigured deploy)
   │                    • Set-Cookie oauth_login = encrypt({ state, userId | null, createdAt })
   │                    • 302 → github.com/login/oauth/authorize?scope=user:email&state=…
   ▼
github.com (user approves, or is sent straight back if they already approved once)
   │
   ▼
GET /api/auth/oauth/github/callback?code=…&state=…
                        • clear oauth_login first (one shot)
                        • state matches, < 10 min, no ?error=, same session as at the start
                        • provider.identify(code): code → token → GET /user (id) + GET /user/emails
                          (the primary entry, only if verified). The token is dropped here
                        • linking rules (below) → a user
                        • create a session, exactly like POST /api/auth/login, set the session cookie
                        • 302 → WEB_URL/dashboard
any failure → 302 → WEB_URL/login?oauth_error=<code>, no session cookie
```

After the redirect, `AuthProvider` (`apps/web/src/auth.tsx`) calls `GET /api/auth/me` and
picks up the session. The login page (`pages/Login.tsx`) shows the button and the
`?oauth_error=` messages.

### Where the pieces live

| File | Does |
|---|---|
| `modules/auth/oauth-login.routes.ts` | the two routes, the `oauth_login` cookie, state / expiry / session checks, redirects |
| `modules/auth/auth.service.ts` | `loginWithProvider` (the linking rules) and `startSession` (shared with password login) |
| `modules/auth/auth.repo.ts` | `findUserByIdentity`, `linkIdentity`, `createUser` (accepts a null password) |
| `services/oauth/providers.ts` | `LoginProvider` adapters (`createGitHubLoginProvider`), `getLoginProvider()`, `loginCallbackUrl()` |
| `db/schema.ts` | the `auth_identities` table |
| `plugins/session.ts` | `oauth_login` cookie options |

### `auth_identities`

One row per provider account that can log in as a user:

| Column | Holds |
|---|---|
| `user_id` | the platform user. `ON DELETE cascade`: deleting the account removes it |
| `provider` | `'github'` |
| `provider_user_id` | GitHub's numeric id, as text. Never the `login`: a login can be renamed and taken by someone else |
| `email` | the email when it was linked. Never read by the code: decisions use the email fetched at each login |

Unique on `(provider, provider_user_id)`: one GitHub account belongs to one user at most.
No column for a token, on purpose.

### Linking rules

Checked in this order by `loginWithProvider`. The email is GitHub's primary email, and
only when GitHub marks it verified. Without one, the login is refused before anything
is read or written.

| Rule | Situation | What happens |
|---|---|---|
| **a** | already logged in when the flow started | link the GitHub account to that user. Already theirs: nothing to do. Someone else's: refused, `identity_taken` |
| **b** | the GitHub account is already linked | log in as its user |
| **c** | a **verified** user has the same email | link to that user, log in |
| **c'** | an **unverified** user has the same email | refused, `email_unverified`. See [section 7](#7-known-limitations-and-what-could-be-done-better) |
| **d** | none of the above | create a user with no password and a verified email, link, log in |

Then a disabled user is refused (`account_disabled`) whichever rule found them. Every
refusal happens before the session is created.

An account created by rule d has `password_hash = null`. Password login for it fails with
`INVALID_CREDENTIALS` in the same time as a wrong password: `login()` verifies against
`DUMMY_PASSWORD_HASH` when the hash is null.

### Error codes (`?oauth_error=` on `/login`)

| Code | When |
|---|---|
| `invalid_state` | cookie missing, broken or not ours; `state` doesn't match |
| `expired` | more than 10 minutes on GitHub |
| `denied` | the user clicked Cancel |
| `provider_error` | another `?error=` from GitHub, no `code`, or an unexpected server error |
| `exchange_failed` | trading the code, or `/user` / `/user/emails`, failed |
| `session_mismatch` | logged in or out in another tab during the flow |
| `no_verified_email` | GitHub's primary email is missing or unverified |
| `email_unverified` | rule c' |
| `identity_taken` | rule a, the GitHub account belongs to another user |
| `account_disabled` | the user found is disabled |

The messages are in `oauthErrorMessages` in `pages/Login.tsx`. The codes are part of
`OAuthErrorCode` in `subscriptions.service.ts`, shared with the subscription flow.

---

## 4. Adding a new provider

Example: Spotify. Steps 1 to 4 give it the **service** flow. Step 5 adds **login** with it,
which is optional: a provider can be used for services only.

1. **`services/oauth/ids.ts`**: add the id to `OAUTH_PROVIDER_IDS`
   (`['github', 'spotify'] as const`). TypeScript then flags every `Record<OAuthProviderId, …>`
   that needs an entry: `factories` and `loginFactories` in `providers.ts`.
2. **`config/env.ts`**: `spotify: oauthProvider('SPOTIFY')` in `env.oauth`. It reads
   `OAUTH_SPOTIFY_CLIENT_ID` / `OAUTH_SPOTIFY_CLIENT_SECRET`. Add `spotify: null` to
   `config/env.fakes.ts`, and document both variables in `apps/api/.env.example`.
3. **`services/oauth/providers.ts`**: write `createSpotifyProvider` (an `OAuthProvider`)
   by copying `createGitHubProvider`, with the matching class from
   [arctic](https://arcticjs.dev/), and add it to `factories`. Check in the provider's docs:
   - **PKCE**: if the arctic class takes a `codeVerifier`, set `pkce: true`; the routes
     generate and check it;
   - **scope separator**: GitHub uses commas, most providers spaces. Give `toCredentials`
     the right split function;
   - **refresh**: `toCredentials` reads `expires_in` and `refresh_token`. Implement
     `refresh()` when the provider sends them;
   - **dead refresh token**: if it isn't answered with `invalid_grant`, add the code to
     `PERMANENT_CODES` in `services/oauth/errors.ts`, or users see "not responding" instead
     of Reconnect;
   - **revoke**: implement it if the provider has a revocation endpoint.
4. **Register the app** at the provider with the Redirect URI
   `${APP_URL}/api/subscriptions/oauth/spotify/callback` (and the login one from step 5 if
   needed). Then write services with `auth: { kind: 'oauth2', provider: 'spotify', scopes: [...] }`,
   see [ADDING_A_SERVICE.md](ADDING_A_SERVICE.md).
5. **Login (optional)**:
   - write `createSpotifyLoginProvider` (a `LoginProvider`) by copying
     `createGitHubLoginProvider`: its own arctic client built with `loginCallbackUrl('spotify')`,
     and an `identify()` that returns a **stable** user id and an email **only if the
     provider says it is verified**. Never return the token;
   - put it in `loginFactories`. A provider without login returns `null` there, and its
     login routes answer 404;
   - add `${APP_URL}/api/auth/oauth/spotify/callback` to the app's Redirect URIs;
   - frontend: a button like GitHub's in `pages/Login.tsx`, with a URL helper like
     `githubLoginUrl()` in `api.ts`. The error messages there name GitHub, so make them
     generic or per provider.

   The routes, the linking rules and the `auth_identities` table already take the provider
   as a parameter: nothing changes there.

---

## 5. Rules that apply to both

- **The browser navigates to these routes, it never fetches them.** Both flows set a cookie
  on the first route and read it on the callback, and browsers refuse cookies from
  cross-site fetch responses. So the routes answer redirects, never JSON (except the login
  404 for an unconfigured provider).
- **One cookie per flow, scoped by path.** `oauth_pending` has path `/api/subscriptions`,
  `oauth_login` has path `/api/auth/oauth`. Both are HttpOnly, `SameSite=Lax` (sent on the
  top-level GET coming back from the provider), `Secure` when `APP_URL` is https, 10 minutes,
  encrypted with `MASTER_KEY`, and cleared at the start of the callback whatever happens.
- **`state` is the CSRF protection.** It is random, stored in the cookie, and must come back
  identical. Nothing else from the query is trusted before it matched.
- **The flow is bound to who started it.** The cookie remembers the user (or "nobody" for
  login). A different session at the callback is refused with `session_mismatch`.
- **Tokens never reach the logs.** Errors are logged with `describeOAuthError()` (name and
  OAuth code only), never as objects: arctic errors can carry the provider's response.
- **An arctic client has one redirect URI**, fixed when it's built and sent again with the
  code. That's why the service adapter and the login adapter are separate clients for the
  same app.
- **Never call `provider.revoke()` on a login token.** For GitHub it deletes the whole grant,
  which takes the user's service subscription token with it.
- **No rate limit on the login routes**, unlike the rest of `/api/auth`: a 429 JSON page in
  the middle of a redirect is a broken page, and a forged callback fails the state check
  before any request to the provider.

---

## 6. Checking that it works

`bun run dev` at the root, with Postgres up and the GitHub app set up as in section 1.

| # | Do | Expect |
|---|---|---|
| 1 | Add a GitHub widget, click **Connect** | Back on the dashboard with "… is connected"; the widget loads |
| 2 | Profile page → disconnect GitHub | Subscription gone; Connect asks for consent again |
| 3 | Log out, **Continue with GitHub** with a GitHub email unknown to the app | On `/dashboard`; new user with `password_hash` null; one `auth_identities` row (rule d) |
| 4 | Log out, GitHub login again | Same user, no new rows (rule b) |
| 5 | Register and verify with your GitHub primary email, log out, GitHub login | Logged in as that user, identity added (rule c) |
| 6 | Register with that email but don't verify, GitHub login | `/login` with `email_unverified`; nothing changed in the database |
| 7 | Set `disabled_at` on the user, GitHub login | `account_disabled`, no session cookie |
| 8 | Cancel on GitHub's page | `denied` |
| 9 | Open `/api/auth/oauth/github/callback?code=x&state=y` directly | `invalid_state`, no cookie |
| 10 | Unset both `OAUTH_GITHUB_*`, restart | API boots; login route 404; GitHub services unavailable |
| 11 | Password login for the user from 3 | `401 INVALID_CREDENTIALS` |
| 12 | Look at `auth_identities` | No token anywhere |

---

## 7. Known limitations and what could be done better

### Unverified accounts with the same email (rule c'), not fixed on purpose

**What we do.** If a local account with GitHub's email exists but was **never verified**,
GitHub login is refused with `email_unverified`. Nothing is created, linked or changed.

**Why we can't just link it.** Its password was chosen by whoever registered it, and we
never proved that person owns the email. An attacker can register `victim@example.com` with
a password they know, without being able to verify it. If GitHub login marked that account
verified and linked it, the real owner would start using it while the attacker's password
still works. This is **pre-account hijacking**, and rule c' blocks it.

**What is still wrong.** The person who registered first squats the email. The real owner
can't log in with GitHub (`email_unverified`) and can't register (`EMAIL_TAKEN`). Their only
way in is the verification link in their own inbox, which gives them an account whose
password the attacker knows, with no way to change it until password reset (#11) exists.

**The better fix: take the account over**, in one transaction:
1. set `email_verified_at = now()`: GitHub just proved the person owns the email;
2. set `password_hash = null`: the squatter's password stops working;
3. delete the user's `sessions` rows (there shouldn't be any: an unverified account can't log in);
4. delete their pending `email_verification` tokens, so an old link does nothing later;
5. apply rule c: link and log in.

It's one more repo method (`takeOverUnverifiedUser`), called by rule c' instead of
throwing. The legitimate owner loses nothing: the account was never usable. Extra hardening:
expire unverified accounts after N days, and mail the owner when a takeover happens.

### Other things that could be better

- **The login token is left valid at GitHub.** It isn't stored, so nobody can use it, but
  `DELETE /applications/{client_id}/token` (that token only, **not** `/grant`) right after
  `identify()` would end it. It would also keep the user far from GitHub's limit of 10
  tokens per user, app and scope set, after which GitHub silently revokes the oldest.
- **No UI for rule a.** Linking GitHub to an existing account works in the backend, but
  nothing in the frontend starts the flow while logged in (the login page is for guests).
  A "Link GitHub" button on the Profile page would.
- **No unlinking**, and no way to set a password on a GitHub-only account (needs #11).
- **Rule d isn't one transaction.** If linking fails after the user is created, the next
  login matches rule c and links it, so it heals itself; a transaction would make that path
  never happen.
- **Tests.** The linking rules can be tested with a fake `LoginProvider`, like the
  subscription flow is with `providers.fakes.ts`. `auth.fakes.ts` also still lacks
  `findUserByIdentity` and `linkIdentity`.
- **One provider.** GitHub only; section 4 is the way to add more.
