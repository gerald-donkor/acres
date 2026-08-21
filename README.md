# Acres

Acres is organized as an npm workspace. The Next.js application lives in
`client/`, the NestJS API in `server/`, and the contracts both read in
`packages/shared/`. The repository root owns workspace installation and command
forwarding.

## Commands

Install dependencies from the repository root:

```bash
npm install
```

Run the Next.js development server:

```bash
npm run dev
```

Run the API development server, on port 3001:

```bash
npm run dev:server
```

Check lint across all three workspaces:

```bash
npm run lint
```

Type-check all three workspaces:

```bash
npm run typecheck
```

Build everything — shared, then client, then server:

```bash
npm run build
```

Serve the production client build, after `npm run build`:

```bash
npm run start
```

Serve the production API build, after `npm run build`:

```bash
npm run start:server
```

Run the API's end-to-end tests:

```bash
npm run test:server
```

Every command is run from the repository root. `build:client`,
`build:server` and `build:shared` target one workspace each.

## Local development

The two servers run side by side:

| service | port | command |
| --- | --- | --- |
| `@acres/client` — Next.js | 3000 | `npm run dev` |
| `@acres/server` — NestJS API | 3001 | `npm run dev:server` |

The API needs an environment file before it will start. Copy the documented
placeholders and fill them in:

```bash
cp server/.env.example server/.env
```

It fails fast on a missing required variable rather than starting and erroring
on the first request. `server/.env` is gitignored.

**No database is provisioned.** `DATABASE_URL` is a placeholder, and the routes
that read the database will fail until a PostgreSQL instance exists and the
first migration has been generated. `GET /health` deliberately does not depend
on the database, so the API still reports itself correctly. See
`docs/backend.md`.
