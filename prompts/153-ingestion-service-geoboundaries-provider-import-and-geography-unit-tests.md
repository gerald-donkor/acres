# 153 — export canonical ingestion and geography tuples, and add isolated unit tests across ingestion service, geoBoundaries provider, import service, and geometry errors

## Scope, and why it is next

The committed repository is on `main` at `c9e9287`
(`refactor(graphql): export tuples and add tests`, the prompt 152 implementation).
The worktree is clean (verified via `git status`, clean working tree).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by external I/O adapter hardening, canonical
tuple exports, and isolated unit testing across scanner, queue, storage, mail, AI,
parser, upload, organization/audit, accounts/auth, security, tenancy guard, common
request/response, prisma/transactions, config, health, forms, job runs, all REST
controllers, data-access repositories, regions public service, metrics middleware,
and GraphQL presentation subsystem (prompts 136–152).

With the GraphQL subsystem and regional shared types completely covered in Prompt 152,
the remaining core domain services and geography acquisition subsystems without
dedicated isolated unit test suites and canonical tuple exports are:

1. **`packages/shared/src/ingestion.ts`**:
   - Codify canonical const tuples and predicates:
     - `DATASET_STATES`, `DatasetState`, and `isDatasetState`.
     - `INGESTION_RUN_STAGES`, `IngestionRunStage`, and `isIngestionRunStage`.
     - `MAPPING_VALIDATION_STATUSES`, `MappingValidationStatus`, and `isMappingValidationStatus`.
     - `VALIDATION_ISSUE_SEVERITIES`, `ValidationIssueSeverity`, and `isValidationIssueSeverity`.
2. **`server/src/geography/geometry.errors.ts`**:
   - Codify canonical const tuple `GEOMETRY_ERROR_CODES`, derived union type `GeometryErrorCode`, and predicate `isGeometryErrorCode`.
3. **`server/src/geography/geometry.errors.spec.ts`** (NEW):
   - Isolated unit tests for `GeometryError`:
     - Constructor properties (`name`, `code`, `message`, prototype).
     - Static factory helpers: `GeometryError.invalid()`, `GeometryError.referenceNotFound()`, `GeometryError.persistenceFailed()` with default and custom messages.
     - `isGeometryErrorCode` predicate checks across valid codes, unknown strings, casing, primitives.
4. **`server/src/geography/geoboundaries-provider.ts`**:
   - Export canonical const tuple `GEOBOUNDARIES_ACQUISITION_CATEGORIES`, derived type `GeoBoundariesAcquisitionCategory`, and predicate `isGeoBoundariesAcquisitionCategory`.
   - Update `GeoBoundariesAcquisitionError` to utilize `GeoBoundariesAcquisitionCategory`.
5. **`server/src/geography/geoboundaries-provider.spec.ts`** (NEW):
   - Isolated unit tests for `GeoBoundariesProvider`:
     - `selectionPath()`: validates ISO-3166 alpha-3 country and ADM0-ADM5 levels, rejects invalid countries/levels with `GeoBoundariesAcquisitionError('selection')`.
     - `safeFetch()`: validates protocol `https:`, hostname allowlist, credentials rejection, manual redirect rejection (3xx), HTTP error codes (!ok), timeout/abort signals.
     - `fetchProviderMetadata()`: parses metadata response, validates required boundary and download properties, throws on missing/malformed schema.
     - `downloadGeoJsonArtifact()`: enforces max byte limit (`GEOBOUNDARIES_MAX_ARTIFACT_BYTES`), calculates and compares SHA-256 digest, rejects checksum mismatch.
     - `isGeoBoundariesAcquisitionCategory` predicate verification.
6. **`server/src/geography/geoboundaries-import.service.ts`**:
   - Export canonical const tuple `GEOBOUNDARIES_IMPORT_ERROR_CATEGORIES`, derived type `GeoBoundariesImportErrorCategory`, and predicate `isGeoBoundariesImportErrorCategory`.
   - Update `GeoBoundariesImportError` to utilize `GeoBoundariesImportErrorCategory`.
7. **`server/src/geography/geoboundaries-import.service.spec.ts`** (NEW):
   - Isolated unit tests for `GeoBoundariesImportService`:
     - `importLayers()`:
       - Empty layers validation: throws `GeoBoundariesImportError('database')` when layers array is empty.
       - ADM2+ hierarchy validation: throws `GeoBoundariesImportError('hierarchy')` when level >= ADM2 and `hierarchyMode === 'unresolved'`.
       - Dry run mode: returns summary with `sourceId: 'dry-run'`, calculated region count, and `unchanged: false` without triggering transaction.
       - Transactional persistence: creates/updates `RegionSource`, upserts regions, persists geometries via `PostgisRegionGeometryRepository`, builds parent references, detects identical checksum (`unchanged: true`).
       - Error handling: rethrows existing `GeoBoundariesImportError`, wraps unknown database failures in `GeoBoundariesImportError('database')`.
     - `isGeoBoundariesImportErrorCategory` predicate verification.
8. **`server/src/ingestion/ingestion.service.spec.ts`** (NEW):
   - Isolated unit tests for `IngestionService`:
     - `listDatasets()`: queries `tx.dataset.findMany` scoped by organizationId, orders by updatedAt desc, includes latest version, maps to `DatasetSummary`.
     - `createDataset()`: calls `idempotency.run` with operation `'datasets.create'`, trims name/description, wraps sourceMetadata with `jsonObject`, creates dataset, maps to summary.
     - `getDataset()`: queries `tx.dataset.findFirst`, throws `ApiException.notFound` if null, returns summary.
     - `updateDataset()`: queries `tx.dataset.findFirst`, throws `ApiException.notFound` if null, throws `ApiException.conflict` if existing state is 'archived', updates dataset with trimmed fields.
     - `listVersions()`: calls `requireDataset`, queries `tx.datasetVersion.findMany`, maps to `DatasetVersionSummary`.
     - `createMapping()`: calls `requireDataset`, calls `requireAcceptedUpload` (throws `notFound` if upload null, throws `conflict` if upload state !== 'accepted'), computes `nextMappingVersion` via `_max.versionNumber + 1`, creates `ColumnMapping` with `validationStatus: 'pending'`.
     - `startRun()`: calls `requireDataset`, calls `requireAcceptedUpload`, finds mapping (throws `notFound` if null), upserts `IngestionRun` with `deterministicKey`, state 'queued', stage 'inspect', enqueues work queue job `ingestion.run`, returns summary.
     - `getRun()`: queries `tx.ingestionRun.findFirst`, throws `notFound` if null, returns summary.
     - `listIssues()`: calls `requireRun`, queries `tx.validationIssue.findMany`, maps to `ValidationIssueSummary` with ISO timestamps.
     - `cancelRun()`: queries `tx.ingestionRun.findFirst`, throws `notFound` if null, throws `conflict` if state is 'published', returns existing run if already 'cancelled', updates state to 'cancelled' with timestamps and `progressPercent: 100`.
     - Ingestion shared predicate tests: `isDatasetState`, `isIngestionRunStage`, `isMappingValidationStatus`, `isValidationIssueSeverity`.

## Subsystems and changes

1. `packages/shared/src/ingestion.ts`:
   - Export canonical const tuples `DATASET_STATES`, `INGESTION_RUN_STAGES`, `MAPPING_VALIDATION_STATUSES`, `VALIDATION_ISSUE_SEVERITIES`.
   - Export type predicates `isDatasetState`, `isIngestionRunStage`, `isMappingValidationStatus`, `isValidationIssueSeverity`.
2. `server/src/geography/geometry.errors.ts`:
   - Export canonical const tuple `GEOMETRY_ERROR_CODES`, type `GeometryErrorCode`, and predicate `isGeometryErrorCode`.
3. `server/src/geography/geometry.errors.spec.ts` (NEW):
   - 10+ unit tests covering `GeometryError` constructor, static factory methods, and `isGeometryErrorCode` predicate.
4. `server/src/geography/geoboundaries-provider.ts`:
   - Export canonical const tuple `GEOBOUNDARIES_ACQUISITION_CATEGORIES`, type `GeoBoundariesAcquisitionCategory`, and predicate `isGeoBoundariesAcquisitionCategory`.
5. `server/src/geography/geoboundaries-provider.spec.ts` (NEW):
   - 12+ unit tests covering selection URL formatting, safe fetch security allowlists, metadata schema verification, artifact digest check, and predicate.
6. `server/src/geography/geoboundaries-import.service.ts`:
   - Export canonical const tuple `GEOBOUNDARIES_IMPORT_ERROR_CATEGORIES`, type `GeoBoundariesImportErrorCategory`, and predicate `isGeoBoundariesImportErrorCategory`.
7. `server/src/geography/geoboundaries-import.service.spec.ts` (NEW):
   - 12+ unit tests covering layer hierarchy validation, dry-run mode, transactional persistence, database error masking, and predicate.
8. `server/src/ingestion/ingestion.service.spec.ts` (NEW):
   - 25+ unit tests covering all `IngestionService` tenant-scoped operations, idempotency integration, queue dispatch, error mappings, and shared predicates.
9. `docs/backend.md`:
   - Record the new canonical shared tuples, type predicates, and isolated unit test suites under the build record.

## Non-goals

- No Prisma schema alterations, migrations, or database DDL changes.
- No changes to REST routes or GraphQL schema.
- No modification of ingestion parser executors.

## Security, tenancy, and failure cases

- Tenancy isolation: `IngestionService` executes all dataset, mapping, run, and issue queries through `TenantTransactionService.organizationScoped`, strictly scoping Prisma queries by `organizationId`.
- Idempotency protection: mutating operations (`createDataset`, `createMapping`, `startRun`) route through `IdempotencyService.run` using caller idempotency keys.
- Upload precondition: datasets cannot bind uploads or start ingestion runs unless the upload is confirmed in the `accepted` state.
- Ingestion state transitions: published runs cannot be cancelled (`conflict`); archived datasets cannot be modified (`conflict`).
- Provider SSRF protection: `GeoBoundariesProvider` enforces a strict HTTPS-only, host-allowlisted URL check, rejecting redirects and embedded credentials.
- Artifact integrity: GeoJSON artifacts are validated against SHA-256 digests and capped at 250 MB before disk writes.
- Hierarchy governance: GeoBoundaries layers at ADM2 or deeper require reviewed parent mappings before publication.

## Testing and verification plan

1. Run isolated unit test suites for the 4 targeted geography and ingestion components:
   ```bash
   npm run test --workspace=@acres/server -- src/geography/geometry.errors.spec.ts
   npm run test --workspace=@acres/server -- src/geography/geoboundaries-provider.spec.ts
   npm run test --workspace=@acres/server -- src/geography/geoboundaries-import.service.spec.ts
   npm run test --workspace=@acres/server -- src/ingestion/ingestion.service.spec.ts
   ```
2. Run full repository verification:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
   - `npm run test:server`
   - `npm run contracts:check`
3. Execute code review loop (`requesting-code-review`, `receiving-code-review`) with subagents.
4. Document changes in `docs/backend.md`.
5. Stage and inspect diff.
6. Commit using `caveman-commit`.

## Required skill manifest

- `requesting-code-review` (.agents/skills/requesting-code-review/SKILL.md)
- `receiving-code-review` (.agents/skills/receiving-code-review/SKILL.md)
- `caveman-commit` (.agents/skills/caveman-commit/SKILL.md)
- `nestjs-best-practices` (.agents/skills/nestjs-best-practices/SKILL.md)
- `javascript-testing-patterns` (.agents/skills/javascript-testing-patterns/SKILL.md)
- `api-design-principles` (.agents/skills/api-design-principles/SKILL.md)
