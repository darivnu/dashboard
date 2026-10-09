# Dashboard

prod: https://dashboard-api-puce.vercel.app/

Bun workspace: `apps/api` (Elysia + PostgreSQL) and `apps/web` (Vite).

## Requirements

- Bun 1.x
- Docker with Compose

## Run with Docker

```sh
docker compose up --build
```

## Run locally

```sh
bun install
docker compose up -d db
cp apps/api/.env.example apps/api/.env
cd apps/api && bun run dev
```

That starts the API on http://localhost:8080. In a second terminal, start the frontend:

```sh
cd apps/web && bun run dev
```

Then open http://localhost:5173. `bun run dev` from the repo root starts both at once.

## Tests, lint and format (frontend)

```sh
cd apps/web
bun run test                  # Vitest
bun run check                 # Biome: lint + format + import order, report only
bunx biome check --write .    # Biome: apply every safe fix
```

## Documentation

- [`apps/web/README.md`](apps/web/README.md) — frontend: structure, widget base, how to add a widget
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — overall architecture and the service/widget registry
- [`docs/BACKEND.md`](docs/BACKEND.md) — backend modules and routes
- [`docs/ADDING_A_SERVICE.md`](docs/ADDING_A_SERVICE.md) — how to add a service or widget, a GitHub one, or a new OAuth provider
- [`docs/HANDLING_OAUTH.md`](docs/HANDLING_OAUTH.md) — OAuth: setting up the GitHub app, connecting a service, logging in with GitHub, adding a new provider

## Email (Brevo)

Without SMTP variables the API prints every email to its logs instead of sending it. To send for real:

1. Create a free account at https://www.brevo.com and confirm it.
2. Senders & IP → Senders: add the address the dashboard will send from and enter the 6-digit code Brevo emails you.
3. Settings → SMTP & API → SMTP: generate an SMTP key. Copy it now; it is shown once.
4. Set, in `apps/api/.env` (local) or the root `.env` (Docker):

```sh
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<the xxxx@smtp-brevo.com login shown on the SMTP page>
SMTP_PASS=<the SMTP key>
MAIL_FROM="Dashboard <the verified sender address>"
```

Once `SMTP_HOST` is set, the other variables are required and the API refuses to boot without them.

Notes:
- If sends are rejected with an authentication error although the key is right, check Security → Authorized IPs in Brevo; an allowlist there blocks every other IP.
- The free tier allows 300 emails a day.
- With a free-mail sender such as Gmail, Brevo rewrites the From domain to `brevosend.com` and some mail may land in spam. Moving to an authenticated domain later only changes `MAIL_FROM`.
- Some hosts block outbound SMTP ports on free plans (Render does). The API still answers normally and logs `ETIMEDOUT`; the mail is not sent.

## GitHub (OAuth)

One GitHub OAuth App serves two things: connecting the GitHub service (widgets) and the "Continue with GitHub" button on the login page. Without these variables the API still boots, but the GitHub service shows as unavailable, its Connect button is disabled, and "Continue with GitHub" answers 404. To enable it:

1. https://github.com/settings/developers → OAuth Apps → New OAuth App.
2. Fill in:
   - Homepage URL: where the frontend is served (`http://localhost:8080` with Docker, `http://localhost:5173` with `bun run dev`). Only shown on GitHub's consent screen.
   - Redirect URIs: add both, each must match exactly:
     - `APP_URL` + `/api/subscriptions/oauth/github/callback` (connecting the service), so `http://localhost:8080/api/subscriptions/oauth/github/callback` locally;
     - `APP_URL` + `/api/auth/oauth/github/callback` (logging in), so `http://localhost:8080/api/auth/oauth/github/callback` locally.

     A missing one shows GitHub's "The redirect_uri is not associated with this application".
   - Leave "Enable Device Flow" and wildcard matching off.
3. Generate a client secret. Copy it now; it is shown once.
4. Set, in `apps/api/.env` (local) or the root `.env` (Docker):

```sh
OAUTH_GITHUB_CLIENT_ID=<the app's Client ID>
OAUTH_GITHUB_CLIENT_SECRET=<the client secret>
```

Both or neither: only one of the two set stops the API at boot.

Notes:
- The Redirect URIs contain `APP_URL`, so production needs its own app, with the deployed API's URL in both.
- Service tokens are stored encrypted with `MASTER_KEY`; changing that key means every user has to connect again. Logging in stores no GitHub token.
- How both flows work, and how to add another provider: [`docs/HANDLING_OAUTH.md`](docs/HANDLING_OAUTH.md).

## Spotify (OAuth)

One Spotify app connects the Spotify service, which has one widget: **Recently played**, the last tracks the connected account listened to (cover, track, artists, when it was played), with a configurable number of rows (1 to 20). Spotify is not used to log in. Without these variables the API still boots, but the Spotify service shows as unavailable and its Connect button is disabled.

It only works on the deployed site: Spotify refuses `http://localhost` redirect URIs (HTTPS or an explicit `127.0.0.1` loopback only), and this project runs locally on `localhost`. Leave the variables unset locally. To enable it in production:

1. https://developer.spotify.com/dashboard → Create app. Under "Which API/SDKs are you planning to use?" select **Web API**.
2. Redirect URI: the production `APP_URL` + `/api/subscriptions/oauth/spotify/callback`. It must match exactly.
3. Settings → User Management: add the name and Spotify e-mail of every account that will connect (see the limits below).
4. Settings → Basic Information: copy the Client ID and the client secret, and set them in the Vercel project of the API:

```sh
OAUTH_SPOTIFY_CLIENT_ID=<the app's Client ID>
OAUTH_SPOTIFY_CLIENT_SECRET=<the client secret>
```

Both or neither: only one of the two set stops the API at boot.

Limitations:
- **Deployed site only.** If the variables are set locally anyway, Connect sends the browser to Spotify, which shows its own "INVALID_CLIENT: Invalid redirect URI" page; the user never comes back to the dashboard.
- **Production domain only.** Preview deployments have changing URLs that cannot be registered as redirect URI, so they cannot connect.
- **Spotify Development Mode:**
  - the app owner's Spotify account needs an active Premium subscription, otherwise the app stops working;
  - at most 5 users, each added by e-mail under User Management before they can connect. Add the jury's accounts before a demo;
  - an account that is not on the list gets a 403 from the API, which the card shows as "needs to be reconnected".
- **No revocation.** Spotify has no revocation endpoint: unsubscribing deletes the stored tokens only. To withdraw access at Spotify, remove the app at https://www.spotify.com/account/apps/.
- **Tracks only.** The endpoint returns no podcast episodes, and at most the last 50 plays.
