# 131 — narrow geography region geometry type carriers to the closed `SupportedGeometryType` union

## Scope, and why it is next

The committed repository is on `main` at `aeadc93`
(`refactor(seed): narrow checksum algorithm literal`, the prompt 130
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 130 — which closed the two seed checksum carriers in
`analytics-scale-seed.types.ts` to `'sha256'`, discharging the prompt 129
deferral with unchanged writers and persistence calls.

There is no unbuilt ordered phase left. A repo-wide inspection over internal
domain boundaries this session proves that exactly two open `geometryType`
carriers remain in the Phase 7 geography persistence layer, while a closed
six-member vocabulary is already defined, enforced by input prevalidation, and
verified by PostGIS topological checks:

```ts
// server/src/geography/geography.types.ts:79–90 — OPEN
export interface RegionGeometryRecord {
  readonly id: string;
  readonly regionId: string;
  readonly sourceId: string;
  readonly srid: number;
  readonly geometryType: string; // ← open (SupportedGeometryType, see below)
  readonly isValid: boolean;
  readonly sourcePrecision: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
```

```ts
// server/src/geography/postgis-region-geometry.repository.ts:15–26 — OPEN
interface RegionGeometryRow {
  id: string;
  regionId: string;
  sourceId: string;
  srid: number;
  geometryType: string; // ← open (SupportedGeometryType, see below)
  isValid: boolean;
  sourcePrecision: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}
```

against the single authority the codebase already defines and enforces for
supported geometry types:

```ts
// server/src/geography/geography.types.ts:17–23 — CLOSED
export type SupportedGeometryType =
  | 'Point'
  | 'MultiPoint'
  | 'LineString'
  | 'MultiLineString'
  | 'Polygon'
  | 'MultiPolygon';
```

Every geometry written to `RegionGeometry` is pre-validated by
`validateGeometryInput()` in `server/src/geography/geometry-validator.ts:15,159`,
producing `ValidatedGeometry.geometryType: SupportedGeometryType`
(`geography.types.ts:93`). The SQL query in
`PostgisRegionGeometryRepository.writeGeometry()` inserts
`${validated.geometryType}` and verifies against PostGIS's geometry type:
`WHERE ... AND UPPER(e.geom_type) = UPPER(${'ST_' + validated.geometryType})`
(`postgis-region-geometry.repository.ts:141,152`). The returning row and the
spatial search queries (`findRegionsContainingPoint`,
`findByRegionAndSource`) select `"geometryType"` directly from this verified
table. Furthermore, all spec fixtures and assertions in
`postgis-region-geometry.repository.spec.ts:62,98,214,233,247` already pass and
expect `'Polygon'` or `'Point'`.

Narrowing `RegionGeometryRecord.geometryType` and `RegionGeometryRow.geometryType`
to `SupportedGeometryType` aligns the internal geography read projection with the
already-narrowed input validator and PostGIS constraints, preventing any
invalid geometry string from passing through the repository without typecheck
failure.

## Reference material read

- `server/src/geography/geography.types.ts:17–23` — definition of
  `SupportedGeometryType` (`'Point' | 'MultiPoint' | 'LineString' |
  'MultiLineString' | 'Polygon' | 'MultiPolygon'`).
- `server/src/geography/geography.types.ts:79–90` — `RegionGeometryRecord` with
  open `geometryType: string`.
- `server/src/geography/geography.types.ts:92–97` — `ValidatedGeometry` already
  using `readonly geometryType: SupportedGeometryType`.
- `server/src/geography/postgis-region-geometry.repository.ts:15–26` —
  `RegionGeometryRow` query projection with open `geometryType: string`.
- `server/src/geography/postgis-region-geometry.repository.ts:28–60` —
  `toRegionGeometryRecord(row)` mapping `row.geometryType` directly.
- `server/src/geography/postgis-region-geometry.repository.ts:141,152` —
  insert and verification using `validated.geometryType`.
- `server/src/geography/postgis-region-geometry.repository.spec.ts` — unit test
  suite verifying geometry persistence, bounds, and spatial point queries.
- `docs/ingestion.md:413–470` — Phase 7 PostGIS geometry write and spatial read
  boundary documentation.

## Exact measurements and code changes

### 1. `server/src/geography/geography.types.ts`

In `RegionGeometryRecord` (around line 84):
- Change `readonly geometryType: string;` to `readonly geometryType: SupportedGeometryType;`.
- `SupportedGeometryType` is declared in the same file at line 17, so no new
  import is required.

### 2. `server/src/geography/postgis-region-geometry.repository.ts`

- Add `type SupportedGeometryType` to the existing named import from
  `./geography.types` (lines 5–11).
- In `RegionGeometryRow` (line 20): change `geometryType: string;` to
  `geometryType: SupportedGeometryType;`.
- In `toRegionGeometryRecord(row: RegionGeometryRow): RegionGeometryRecord`
  (line 52): `row.geometryType` is now typed as `SupportedGeometryType`,
  mapping directly into `RegionGeometryRecord.geometryType` without casts.

### 3. Documentation update in `docs/ingestion.md`

- Record the narrowing of `RegionGeometryRecord.geometryType` and
  `RegionGeometryRow.geometryType` to `SupportedGeometryType` in the PostGIS
  boundary section of `docs/ingestion.md`.
- Document that this change is strictly a compile-time type narrowing across the
  internal administrative geography persistence boundary, with zero schema,
  data, query, or runtime changes.

## Expected impact

- Internal administrative geography boundary only (`server/src/geography/`).
- Zero changes to public REST controllers, GraphQL resolvers, OpenAPI contracts,
  or browser client packages.
- Zero Prisma migrations: PostgreSQL `RegionGeometry.geometryType` remains a
  `String` column; the PostGIS CTE ensures only valid `SupportedGeometryType`
  strings can be written.
- Existing geography test suites compile and pass unchanged.

## Non-goals

- No change to `RegionGeometry.srid` (`number` / 4326).
- No change to `sourcePrecision` or `metadata` (both remain optional free-form
  metadata).
- No change to `validateGeometryInput` or PostGIS SQL queries.
- No public REST or GraphQL API exposure for raw geometries.
- No database schema alteration or Prisma migration.
- No changes to GeoBoundaries import service or manifest schemas.

## Checks to run

```bash
# 1. Geography unit tests
npm run test --workspace=@acres/server -- src/geography/postgis-region-geometry.repository.spec.ts
npm run test --workspace=@acres/server -- src/geography

# 2. Public API and contract parity check
npm run contracts:check

# 3. Workspace-wide lint, typecheck, and build
npm run lint
npm run typecheck
npm run build

# 4. Git whitespace and status review
git diff --check
git status --short
git diff --stat
```

`docs/ingestion.md` owns the documentation record. Quote real command outputs.

## Rollback and stop conditions

Rollback is a clean git revert of modified source and documentation files.
Stop and re-evaluate if any of the following occurs:
- Any geography unit test fails or changes behavior.
- Any caller passes an unsupported geometry type string that cannot be mapped.
- `npm run contracts:check` detects drift in OpenAPI or GraphQL contracts.
- A runtime error or cast is required to satisfy typechecking.

## Completion criteria

- `RegionGeometryRecord.geometryType` and `RegionGeometryRow.geometryType` admit
  strictly `SupportedGeometryType`.
- Zero casts (`as SupportedGeometryType`) introduced in repository mapping.
- All geography test suites pass cleanly.
- Workspace-wide lint, typecheck, and build succeed with exit code 0.
- `docs/ingestion.md` updated with the prompt 131 record.
- Changes committed locally to `main` using `caveman-commit`.

## SKILLS USED

- `architecture-patterns` — preserve clean hexagonal port/adapter separation in
  the geography module; keep domain types aligned with internal repository rows
  without leaking ORM or persistence details.
- `nestjs-best-practices` — keep changes restricted to typed provider/repository
  interfaces without changing dependency injection or module wiring.
- `postgres-best-practices` — verify that PostGIS spatial column constraints,
  CTE predicates, and GiST queries remain byte-for-byte identical.
- `api-design-principles` — guard duty: ensure internal repository types do not
  leak into or modify public REST/GraphQL contracts.
- `javascript-testing-patterns` — run focused Jest suites for the geography
  repository and all geography seed/validator modules to verify zero regression.
- `requesting-code-review` — dispatch reviewer subagent with structured context
  and verify diff against requirements before commit.
- `receiving-code-review` — evaluate reviewer findings with technical rigor and
  verify code before acting.
- `caveman-commit` — format the final commit message following Conventional
  Commits guidelines.

Not loaded, with reason: `playwright` (no UI or browser flow touched); frontend/
Tailwind/shadcn/GSAP skills (pure server-side backend persistence type change).
