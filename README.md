# Dashboard

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
