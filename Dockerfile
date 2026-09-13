FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1
WORKDIR /app/apps/api
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/drizzle ./drizzle
COPY --from=build /app/apps/web/dist ../web/dist
EXPOSE 8080
CMD ["sh", "-c", "bun dist/db/migrate.js && bun dist/server.js"]