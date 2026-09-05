# Acres

**Acres** is an open-source B2B regional-data analytics platform designed to transform complex geospatial and regional datasets into evidence that organizations can browse, compare, explain, and act on.

It provides organization-scoped multi-tenancy, quarantined file ingestion (CSV, XLSX, GeoJSON), automated ClamAV malware scanning, geoBoundaries global administrative boundary mapping (ADM0–ADM5), normalized analytics snapshots, interactive dashboards, governed immutable reports, and an optional grounded AI evidence-drafting preview.

---

## Architecture & Monorepo Layout

Acres is organized as an **npm workspace** monorepo:

| Workspace  | Package         | Path                                  | Tech Stack & Description                                                                                                                                                                                                                                                                                  |
| :--------- | :-------------- | :------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client** | `@acres/client` | [`client/`](client)                   | **Next.js 16 (App Router)**, React 19, Tailwind CSS v4, `@base-ui/react` (shadcn `base-nova`), GSAP. Houses the public marketing site (`/`), authentication flows (`/login`, `/register`), and the protected application shell (`/app`) with organization switching, datasets, dashboards, and reporting. |
| **Server** | `@acres/server` | [`server/`](server)                   | **NestJS 11** REST and GraphQL (code-first Apollo) APIs, dedicated BullMQ/Valkey background workers (`worker.ts`), and **Prisma 7** data layer with PostgreSQL 18 & PostGIS 3.6.                                                                                                                          |
| **Shared** | `@acres/shared` | [`packages/shared/`](packages/shared) | Canonical TypeScript types, OpenAPI 3.1 REST contracts, GraphQL SDL, DTOs, and shared API clients.                                                                                                                                                                                                        |

---

## Core Capabilities Built

- **Multi-Tenant Governance & Security:** Tenant isolation enforced with PostgreSQL Row-Level Security (RLS), role-based permissions (`owner`, `admin`, `analyst`, `viewer`), cryptographically signed session tokens, double-submit CSRF protection, and an immutable audit ledger.
- **Governed Ingestion Pipeline:** Presigned S3 quarantine uploads via local Garage storage, automated ClamAV antivirus scanning, and memory/time-bounded child process parsers for CSV, Excel (XLSX), and GeoJSON.
- **Geospatial & Boundary Intelligence:** Ingestion and PostGIS spatial storage for geoBoundaries `gbOpen` global administrative boundaries (ADM0 through ADM5), supporting topological hierarchy enforcement and alias matching.
- **Analytics Engine & Aggregates:** Typed metric definitions, temporal observations with data quality flags, and pre-aggregated regional snapshots optimized for analytical queries.
- **Interactive Dashboards & Saved Views:** Customizable dashboard widgets, saved views, and high-performance GraphQL `dashboardSummary` queries.
- **Governed Reports & Exports:** Immutable report revisions, frozen evidence captures, and worker-rendered export generation for PDF, Excel (XLSX), and CSV formats.
- **Optional AI Evidence Drafting (Phase 11A Preview):** Privacy-conscious draft generation powered by Google Gemini 2.5 Flash, featuring strict data minimization, mandatory user disclosure, and an audit ledger.

---

## Prerequisites

- **Node.js**: `v24.x` or `v26.x` LTS (recommended: `^24.0.0` or higher)
- **npm**: `v10.x` or `v12.x`
- **Docker** & **Docker Compose** (for PostgreSQL, PostGIS, Valkey, Garage S3, and ClamAV)

---

## Local Development Setup

### 1. Install Dependencies

Install dependencies across all workspaces from the repository root:

```bash
npm install
```

### 2. Configure Environment Files

Prepare environment files for the containers, server, and client:

```bash
# Docker Compose infrastructure credentials
cp .env.example .env

# NestJS API environment configuration
cp server/.env.example server/.env

# Next.js client configuration (optional for local defaults)
cp client/.env.example client/.env
```

Review and adjust values in `server/.env` as needed (e.g., database credentials, CSRF secrets, and rate limits).

### 3. Start Infrastructure Services

Start the local backing services via Docker Compose:

```bash
# Start PostgreSQL (with PostGIS 3.6), Valkey 9, Garage S3, and ClamAV
npm run deps:up

# Initialize local Garage S3 storage buckets and access credentials
npm run garage:setup
```

_(Note: To start only PostgreSQL without object storage or queue dependencies, use `npm run db:up`.)_

### 4. Run Database Migrations

Apply the Prisma schema migrations to the local PostgreSQL instance:

```bash
npm run prisma:migrate:deploy --workspace=@acres/server
# or apply migrations and generate the client:
npx prisma migrate dev --schema=server/prisma/schema.prisma
```

### 5. Start Development Servers

Run the frontend, backend, and background worker concurrently:

| Component              | Command                                              | Address                 |
| :--------------------- | :--------------------------------------------------- | :---------------------- |
| **Next.js Web Client** | `npm run dev`                                        | `http://localhost:3000` |
| **NestJS API Server**  | `npm run dev:server`                                 | `http://localhost:3001` |
| **Background Worker**  | `npm run start:worker:dev --workspace=@acres/server` | _(CLI / BullMQ worker)_ |

---

## Repository Scripts

Every primary command can be executed from the repository root:

### Development & Builds

- `npm run dev` — Starts the Next.js development server (`@acres/client`) on port 3000.
- `npm run dev:server` — Starts the NestJS API server (`@acres/server`) on port 3001 in watch mode.
- `npm run build` — Builds all packages in order: `@acres/shared`, `@acres/client`, and `@acres/server`.
- `npm run start` — Serves the production Next.js build.
- `npm run start:server` — Serves the production NestJS API build.
- `npm run start:worker` — Runs the production background worker.

### Testing & Quality Gates

- `npm run lint` — Runs ESLint across all three workspaces.
- `npm run typecheck` — Runs TypeScript typechecks across all three workspaces.
- `npm run test:server` — Runs the NestJS server unit and E2E test suites.
- `npm run test:client:e2e` — Runs Playwright end-to-end tests for the web client.
- `npm run ops:check` — Executes operational preflight checks: production template verification, secret scanning, Docker runtime validation, and dependency audits.

### Geography & Analytics Harnesses

- `npm run geography:provider:acquire` — Acquires geoBoundaries data.
- `npm run geography:provider:review` — Reviews and prepares boundary manifests.
- `npm run geography:provider:import` — Imports reviewed boundaries into PostGIS.
- `npm run geography:plans` — Verifies geography query execution plans.
- `npm run analytics:plans` — Verifies analytics query execution plans against scale test harnesses.

---

## Detailed Documentation

Deep technical documentation and architectural decision records live in [`docs/`](docs):

- [`docs/product.md`](docs/product.md) — Canonical B2B product requirements, roles, permissions, and user journeys.
- [`docs/system-architecture.md`](docs/system-architecture.md) — Architectural topologies, data schemas, modular boundaries, and security models.
- [`docs/design-system.md`](docs/design-system.md) & [`docs/components.md`](docs/components.md) — Typography, color tokens, and UI primitives.
- [`docs/backend.md`](docs/backend.md) — NestJS implementation records, Prisma 7 specifics, and API endpoints.
- [`docs/authenticated-app.md`](docs/authenticated-app.md) — Next.js client integration, API bridge, and `/app` shell.
- [`docs/ingestion.md`](docs/ingestion.md) — Boundary ingestion pipelines, upload quarantine, ClamAV, and parser architectures.
- [`docs/analytics.md`](docs/analytics.md) — Metric observations, data quality flags, and aggregate snapshot models.
- [`docs/dashboards.md`](docs/dashboards.md) — Dashboard views and optimized GraphQL endpoints.
- [`docs/reports.md`](docs/reports.md) — Governed report revisions, frozen evidence records, and export rendering workers.
- [`docs/ai.md`](docs/ai.md) — Gemini AI draft preview, data minimization boundaries, and grounding evaluations.
- [`docs/operations.md`](docs/operations.md) — Production operations, backup/restore runbooks, CI gates, and launch readiness checks.
