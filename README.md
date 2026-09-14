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
