# Dashboard

Dashboard is a personal start page. You pick small panels called widgets (radio stations on a globe, your GitHub notifications, this week's free games, NASA's picture of the day) and arrange them on one screen that keeps itself up to date. Each person has their own account and their own layout.

Live version: https://dashboard-api-puce.vercel.app/

## What you can do with it

The app gathers information from several websites in one place, so you do not have to open each of them. Some examples:

- **A personal start page.** Open one tab in the morning and see a fact of the day, a piece of advice, a fox picture and the radio stations people are listening to around the world.
- **Following your GitHub activity.** Connect your GitHub account and keep your unread notifications and your contribution statistics in view.
- **Watching for free games.** See which games are free on the Epic Games Store right now and which ones come next, for the country you choose.
- **Keeping a film or music diary in sight.** Show the last films a Letterboxd member watched, or the last tracks you played on Spotify.

## Features

- **Accounts.** Register with an email and a password; the email address must be verified through a link before the first login. Logging in with a GitHub account is also possible.
- **Services with three kinds of connection.** Some services need nothing, some need an API key that you paste once, and some are connected through the provider's own login page (OAuth).
- **Configurable widgets.** The same widget can be added several times with different settings and its own title.
- **Refresh rate per widget.** Each widget reloads its data on its own timer. You choose the interval, down to a minimum set by the widget.
- **Add, edit, move, resize and delete widgets.** Drag a card by its header to move it and drag its bottom-right corner to resize it. Every card also has ↑ and ↓ buttons ("Move earlier" and "Move later") that work without dragging.
- **Layout for small screens.** On screens narrower than 768 px the cards collapse to a single column.
- **Profile page.** See your account, manage the API keys and connections of every service, and delete your account.
- **Settings page.** Choose a light or dark theme and one of four text sizes. The choice is remembered in the browser.
- **Credentials stored encrypted.** API keys and OAuth tokens are encrypted before they reach the database. Passwords are stored as hashes only.

## Services and widgets

A service is a website the app gets data from. A widget is one panel showing something from that service.

| Service | How to connect | Widget | Settings | Refresh (default / minimum) |
|---|---|---|---|---|
| Radio Browser (`radio_browser`) | Nothing to connect | Station map (`station_map`): the most-listened radio stations on a globe; click one to listen | Number of stations: 1 to 3000, default 200 | 10 min / 2 min |
| Letterboxd (`letterboxd`) | Nothing to connect | Recent films (`recent_films`): the last films from a member's public diary | Letterboxd username (required); number of films, default 5 | 30 min / 5 min |
| Advice Slip (`advice_slip`) | Nothing to connect | Random advice (`random_advice`): a random piece of advice | none | 1 min / 10 s |
| Random Fox (`random_fox`) | Nothing to connect | Random Fox Picture (`random_fox`): a random fox image | none | 1 min / 10 s |
| Facts (`facts`) | Nothing to connect | Fact of the day (`fact_of_the_day`): a curious fact, the same one all day | none | 1 h / 30 min |
| NASA (`nasa`) | API key (free, from https://api.nasa.gov) | Astronomy Picture of the Day (`apod`) | none | 1000 s / 5 min |
| NASA (`nasa`) | API key (free, from https://api.nasa.gov) | Near Earth Objects (`neows`): asteroids passing close to Earth | Days ahead: 1 to 7, default 3 | 1 h / 10 min |
| GitHub (`github`) | Connect (OAuth) | Notifications (`notifications`): your unread notifications | How many to show: 1 to 20, default 5 | 5 min / 2 min |
| GitHub (`github`) | Connect (OAuth) | Contribution Stat card (`contribution_stat_card`): your contributions over the last year | none | 1 h / 150 s |
| Epic Games (`epic_games`) | Nothing to connect | Free games (`free_games`): games free now and coming next on the Epic Games Store | Store country (two-letter code), default ES | 30 min / 10 min |
| Pokémon TCG (`pokemon_tcg`) | Nothing to connect | Booster opener (`booster_opener`): open booster packs of a collection | chosen inside the widget | 1 h / 10 min |
| Spotify (`spotify`) | Connect (OAuth) | Recently played (`recently_played`): the last tracks you listened to | How many to show: 1 to 20, default 5 | 5 min / 1 min |

Two test services, `mock` and `mock_key`, exist only outside production (`NODE_ENV` other than `production`), so they do not appear in the Docker setup or on the live version.

GitHub and Spotify can be connected only when the server has credentials for them, see [GitHub (OAuth)](#github-oauth) and [Spotify (OAuth)](#spotify-oauth). Without them the service still appears and its widgets can be added, but its Connect button is disabled, so those widgets never get data.

## Using the app

1. **Register.** Open the app, choose "Sign up" and enter an email address and a password.
2. **Verify your email.** Open the link you receive; it is valid for 24 hours. When the server has no SMTP settings (the default), no mail is sent: the whole message, link included, is printed in the API logs (the terminal running the API, or `docker compose logs api`). Copy the link from there.
3. **Log in** with your email and password. "Continue with GitHub" logs you in without a password; the button is always there, but it only works when the server has GitHub credentials.
4. **Add a widget.** Press "Add Widget" in the top bar and pick a widget from the list, which is grouped by service.
5. **Configure it.** Fill in the widget's settings (for example the Letterboxd username), optionally give it a title, and set "Refresh every (seconds)". The form refuses a value below the widget's minimum.
6. **Connect a service when the widget asks for it.**
   - NASA: the card shows "Set API key". Paste a key from https://api.nasa.gov.
   - GitHub or Spotify: the card shows "Connect". It takes you to the provider's page to approve the access, then back to the dashboard.

   The same keys and connections can be set, replaced or removed for each service in one place, on the Profile page.
7. **Edit a widget.** "Edit" on the card changes its title, settings, refresh rate, width and height. "Refresh" asks for the data again straight away; the server may answer with the copy it already holds when that copy is younger than the widget's minimum. The Random advice and Recent films cards have no Refresh button.
8. **Move and resize.** On a wide screen, drag a card by its header to move it, and drag its bottom-right corner to resize it. On a narrow screen use the ↑ and ↓ buttons on the card (named "Move earlier" and "Move later" for screen readers); on a wide screen they appear when you reach them with the Tab key.
9. **Delete a widget** with "Delete" on its card. The app asks for confirmation.
10. **Account menu.** The round button in the top right corner leads to Profile (account, services, delete account), Settings (theme and text size) and "Log out".

## Getting started

### Requirements

- Docker with Compose
- [Bun](https://bun.sh) 1.x, for "Run locally" and "Build" only

### Run with Docker

This builds and starts the whole app (database, API and frontend) with two commands:

```sh
cp apps/api/.env.example apps/api/.env
docker compose up --build
```

Then open http://localhost:8080.

### Run locally

This runs the API and the frontend as two processes that reload when a file changes. Only the database runs in Docker.

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

### Build

```sh
bun run build
```

Run from the repo root, this builds both apps: the API into `apps/api/dist` and the frontend into `apps/web/dist`.

## Configuration

The API reads its settings from environment variables, kept in `apps/api/.env`. `apps/api/.env.example` holds working values for a local setup.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `production` hides the test services. The API documentation page exists only in `development` |
| `PORT` | `8080` | Port the API listens on |
| `DATABASE_URL` | none, required | PostgreSQL connection string |
| `APP_URL` | none, required | Public address of the API. OAuth redirect addresses are built from it |
| `WEB_URL` | `APP_URL`; required in production | Public address of the frontend. Links in emails and redirects after an OAuth connection point there |
| `CORS_ORIGINS` | `WEB_URL` | Comma-separated list of websites allowed to call the API |
| `SESSION_TTL_DAYS` | `30` | Number of days a login stays valid |
| `MASTER_KEY` | none, required | Key that encrypts stored API keys and OAuth tokens: 32 random bytes in base64 (`openssl rand -base64 32`). Changing it makes every stored credential unreadable |
| `SMTP_HOST` | unset | Mail server. Unset: emails are printed in the API logs instead of being sent |
| `SMTP_PORT` | `587` | Mail server port |
| `SMTP_USER` | none, required once `SMTP_HOST` is set | Mail server login |
| `SMTP_PASS` | none, required once `SMTP_HOST` is set | Mail server password or key |
| `MAIL_FROM` | none, required once `SMTP_HOST` is set | Sender shown in the emails, for example `Dashboard <hello@example.com>` |
| `OAUTH_GITHUB_CLIENT_ID` | unset | GitHub OAuth App id. Set together with the secret, or leave both unset |
| `OAUTH_GITHUB_CLIENT_SECRET` | unset | GitHub OAuth App secret |
| `OAUTH_SPOTIFY_CLIENT_ID` | unset | Spotify app id. Set together with the secret, or leave both unset |
| `OAUTH_SPOTIFY_CLIENT_SECRET` | unset | Spotify app secret |

The frontend has one variable, read when it is built:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | unset | Address of the API. Unset: the frontend calls the address it was loaded from, which is right for every setup described here |

Docker Compose has three more, read from the environment of the shell that runs `docker compose`:

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_USER` | `dashboard` | Database user |
| `POSTGRES_PASSWORD` | `dashboard` | Database password |
| `POSTGRES_DB` | `dashboard` | Database name |

With Docker Compose, `docker-compose.yml` itself sets `NODE_ENV` (`production`), `PORT`, `DATABASE_URL`, `APP_URL`, `WEB_URL`, `CORS_ORIGINS` and `SESSION_TTL_DAYS` for the container, so the values of these seven variables in `apps/api/.env` are ignored there. To change `APP_URL`, `WEB_URL`, `CORS_ORIGINS` or `SESSION_TTL_DAYS` under Docker, set them in the shell that runs `docker compose`. Every other variable comes from `apps/api/.env`.

## Email (Brevo)

Without SMTP variables the API prints every email to its logs instead of sending it. To send for real:

1. Create a free account at https://www.brevo.com and confirm it.
2. Senders & IP → Senders: add the address the dashboard will send from and enter the 6-digit code Brevo emails you.
3. Settings → SMTP & API → SMTP: generate an SMTP key. Copy it now; it is shown once.
4. Set, in `apps/api/.env`:

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

One GitHub OAuth App serves two things: connecting the GitHub service (widgets) and the "Continue with GitHub" button on the login page. Without these variables the API still boots, but the GitHub service cannot be connected (its Connect button is disabled), and "Continue with GitHub" answers 404. To enable it:

1. https://github.com/settings/developers → OAuth Apps → New OAuth App.
2. Fill in:
   - Homepage URL: where the frontend is served (`http://localhost:8080` with Docker, `http://localhost:5173` with `bun run dev`). Only shown on GitHub's consent screen.
   - Redirect URIs: add both, each must match exactly:
     - `APP_URL` + `/api/subscriptions/oauth/github/callback` (connecting the service), so `http://localhost:8080/api/subscriptions/oauth/github/callback` locally;
     - `APP_URL` + `/api/auth/oauth/github/callback` (logging in), so `http://localhost:8080/api/auth/oauth/github/callback` locally.

     A missing one shows GitHub's "The redirect_uri is not associated with this application".
   - Leave "Enable Device Flow" and wildcard matching off.
3. Generate a client secret. Copy it now; it is shown once.
4. Set, in `apps/api/.env`:

```sh
OAUTH_GITHUB_CLIENT_ID=<the app's Client ID>
OAUTH_GITHUB_CLIENT_SECRET=<the client secret>
```

Both or neither: only one of the two set stops the API at boot.

Notes:
- The Redirect URIs contain `APP_URL`, so production needs its own app, with the production origin in both (in production the web app and the API share one origin).
- Service tokens are stored encrypted with `MASTER_KEY`; changing that key means every user has to connect again. Logging in stores no GitHub token.
- How both flows work, and how to add another provider: [`docs/HANDLING_OAUTH.md`](docs/HANDLING_OAUTH.md).

## Spotify (OAuth)

One Spotify app connects the Spotify service, which has one widget: **Recently played**, the last tracks the connected account listened to (cover, track, artists, when it was played), with a configurable number of rows (1 to 20). Spotify is not used to log in. Without these variables the API still boots, but the Spotify service cannot be connected: its Connect button is disabled.

It only works on the deployed site: Spotify refuses `http://localhost` redirect URIs (HTTPS or an explicit `127.0.0.1` loopback only), and this project runs locally on `localhost`. Leave the variables unset locally. To enable it in production:

1. https://developer.spotify.com/dashboard → Create app. Under "Which API/SDKs are you planning to use?" select **Web API**.
2. Redirect URI: the production origin + `/api/subscriptions/oauth/spotify/callback`. It must match exactly.
3. Settings → User Management: add the name and Spotify e-mail of every account that will connect (see the limits below).
4. Settings → Basic Information: copy the Client ID and the client secret, and set them in the environment variables of the Vercel project:

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

## Tests and lint

API (Bun's test runner):

```sh
cd apps/api && bun test
```

Frontend:

```sh
cd apps/web
bun run test                  # Vitest
bun run check                 # Biome: lint + format + import order, report only
bunx biome check --write .    # Biome: apply every safe fix
```

## Technologies

| Layer | Technology | Role |
|---|---|---|
| Backend | Bun | Runs the API, installs packages and runs the API tests |
| Backend | Elysia | Web framework: routes, request validation, API documentation |
| Backend | Drizzle | Describes the database tables in TypeScript and generates the migrations |
| Backend | PostgreSQL | Database: accounts, sessions, service connections, widgets |
| Backend | arctic | Talks to OAuth providers (GitHub, Spotify) |
| Backend | nodemailer | Sends the verification emails over SMTP |
| Frontend | React 19 | Builds the interface from components |
| Frontend | Vite | Development server and production build |
| Frontend | TypeScript | Typed JavaScript, used by both apps |
| Frontend | Tailwind CSS v4 | Styling |
| Frontend | TanStack Query | Loads and caches server data, and reloads each widget on its timer |
| Frontend | React Router | Pages and navigation |
| Frontend | Eden Treaty | Calls the API with the API's own types, so a mismatch is a compile error |
| Frontend | react-grid-layout | Dragging and resizing the dashboard cards |
| Frontend | MapLibre GL | Draws the globe of the radio station map |
| Quality | Vitest | Frontend tests |
| Quality | Biome | Linter and formatter of the frontend |
| Running it | Docker Compose | Runs the whole app, or only the database, on one machine |
| Running it | Vercel | Hosts the live version |

## System structure

```
dashboard/
├── apps/
│   ├── api/                # the backend: HTTP API, database access, services
│   └── web/                # the frontend: the pages shown in the browser
├── docs/                   # architecture and how-to documents
├── docker-compose.yml      # database + app for one machine
├── Dockerfile              # image used by Docker Compose
├── vercel.json             # production setup on Vercel
└── package.json            # Bun workspace listing apps/*
```

**How a widget gets its data.** Every service is described once in the API's code and stored in a registry when the API starts. The catalog (`GET /api/catalog`) publishes that registry, which is how the frontend knows which widgets exist and which settings each one takes. Adding a widget creates an instance: one saved row holding the chosen settings, refresh rate and position. The frontend then asks the API for the data of each instance on that instance's timer. The API calls the outside service and keeps the answer in a short-lived cache in memory, so many dashboards showing the same thing do not flood that service.

**Production and Docker Compose are built differently.** In production the app is one Vercel project with two Services, the API and the frontend, behind a single address. With Docker Compose a single container does both jobs: the API also serves the built frontend, on port 8080. In both cases the browser sees one origin.

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## `about.json`

`about.json` is the machine-readable description of the server required by the project subject: the address of the client that asked, the server's time, and every service with its widgets and their settings. It answers at http://localhost:8080/about.json, outside `/api`, and needs no login.

```json
{
    "client": { "host": "172.18.0.1" },
    "server": {
        "current_time": 1760180400,
        "services": [
            {
                "name": "NASA",
                "widgets": [
                    {
                        "name": "Near Earth Objects",
                        "description": "Near Earth Objects from NASA",
                        "params": [{ "name": "days", "type": "integer" }]
                    }
                ]
            }
        ]
    }
}
```

## Documentation

- [`apps/web/README.md`](apps/web/README.md): frontend structure, widget base, how to add a widget
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): overall architecture, from the service registry to deployment
- [`docs/BACKEND.md`](docs/BACKEND.md): backend modules, routes and database tables
- [`docs/ADDING_A_SERVICE.md`](docs/ADDING_A_SERVICE.md): how to add a service or widget, a GitHub one, or a new OAuth provider
- [`docs/HANDLING_OAUTH.md`](docs/HANDLING_OAUTH.md): OAuth, from setting up the GitHub app to adding a new provider
