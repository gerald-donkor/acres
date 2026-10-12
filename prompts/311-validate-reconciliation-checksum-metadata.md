# Phase 12K — Validate reconciliation checksum metadata

## Scope and why this is next

Continue the open recovery-evidence gate in `docs/build-plan.md` §§13–14 after
committed Prompt 310 (`b638958`). The shared inventory validator covers identity,
counts and lifecycle fields, but checksum values still coerce or disappear.
Offline planning probes returned `clean` for matching boolean, numeric, object,
array and nonhex checksum values. The listing adapter decoded `!!!` to an empty
digest and `YQ==` to the one-byte hex `61`. These are synthetic fixture results,
not evidence of a production incident.

The user instructed implementation after planning. Write and re-read this prompt,
then execute without another permission question.

## References and verified authority

- `AGENTS.md`: scope resolution, prompt, checks, review and local commit.
- `docs/build-plan.md` §§13–14 and Prompts 305–310 implementation records.
- `docs/skills.md`: bounded continuation skill manifest and lock convention.
- `docs/operations.md`: recovery topology, restoration and Prompts 307–310.
- `docs/launch-checklist.md`: Category 6 simulation versus live approval.
- `docs/security.md`: recovery evidence boundaries and Prompts 306–310.
- `docs/system-architecture.md` §11.3–11.4: recovery and diagnostic boundaries.
- `docs/product.md`: product, roles and journeys stay unchanged.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js`, `.ts`: shared
  inventory validation, listing, pg adapter, injected runner and receipt shape.
- `server/prisma/schema.prisma`: nullable string checksum metadata, read only.
- `node_modules/@aws-sdk/client-s3/dist-types/models/models_0.d.ts`, `_Object`:
  standard listing entries expose checksum algorithm/type, **not** a SHA256
  digest value. The utility's existing `ChecksumSHA256` handling is optional
  extension handling; do not claim the SDK supplies it, add Head/Get requests,
  infer a digest from ETag, or pretend absent checksums verify content.
- Root `package.json` and `scripts/ops/run-launch-drills.sh` Stage 7 caller.
- Local Buffer base64/hex and regex probes: permissive decoding requires explicit
  validation and canonical round-trip checks. No new third-party APIs.

No visual work or measurements; comp and Next/React/Tailwind guides do not
apply. No installed skill owns framework-free Node checksum validation. Use
the inspected source/types and local runtime probes. The security skill has no
standalone Node CLI reference; apply its general secure-input guidance.

## Impact, compatibility and non-goals

Reject malformed supplied checksum values before filtering/exclusion, pg row
normalization, injected service acquisition, listing completion or publication.
Use existing fixed inventory/listing errors and sanitized runner errors.
No routes, CLI, SQL, signatures, facade, report schema/mode, publication,
dependencies or Stage 7 caller change.

Absent/null checksums stay valid. Preserve case-insensitive hex comparison and
original checksum case in missing-object evidence. Accept nonempty complete
hexadecimal byte strings of any length, including existing 6-byte fixture
digests; do not impose a universal SHA256 length on generic `checksumHex`.
Reject odd-length hex, nonhex, empty/whitespace strings and nonstring values.
This deliberate stricter runtime boundary is the compatibility change.

Do not change `checksumAlgorithm` semantics, enforce algorithm pairing/length
or require checksums for a clean metadata comparison. No content fetch/hash,
live authenticity/completeness/snapshot claims, state consistency, resource
caps, network retries, cross-realm/hostile in-process getter/proxy defenses,
online audit, deployment, push or launch approval.

## Implementation steps

1. Add behavior regressions before changing source; retain all 377 existing
   tests. Cover both DB/storage `checksumHex` and coercible objects, malformed
   values otherwise concealed by filters/exclusions, and matching invalid
   values that previously gave a clean report. Assert fixed value-free errors.
2. Extend private shared `validateInventory` to accept `checksumHex` only when
   undefined/null or a primitive nonempty string matching complete hex bytes
   (`^(?:[0-9a-fA-F]{2})+$`). Do not mutate or normalize caller metadata, and do
   not coerce objects. Reuse the boundary for pg rows and injected inventories.
3. Validate the listing adapter's optional `ChecksumSHA256` extension before
   decoding. Undefined/null remains absent. A supplied value must be a primitive
   canonical standard-base64 string representing exactly 32 bytes: 43 alphabet
   characters and one `=`, decoded length 32, and encoding back to base64 equals
   the original. Reject URL-safe spelling, whitespace, invalid/missing/extra
   padding, noncanonical pad bits, composite suffixes, wrong byte lengths,
   primitives/objects/arrays and empty strings. Check type/shape before Buffer
   conversion. Reuse the fixed listing error. Absent checksums remain null.
4. Cover valid generic hex (mixed case, zeros, short/long complete bytes), absent
   checksums on either/both sides, byte-size-only comparison, checksum mismatch,
   missing evidence preservation, frozen input ownership and orphan behavior.
   Test canonical 32-byte base64, null/omitted extension, algorithm/type-only
   standard listing entries, unchanged command arguments and report shape.
5. Test whole-query rejection after a valid row, whole-list rejection on a
   malformed later page, and runner failures for injected, queried and listed
   malformed checksums. Assert no summary, success message, staging artifact or
   receipt; invalid injections must fail before either client is touched.
   Use private sentinels to prove errors do not reflect supplied metadata.

## Verification and completion

Re-read this prompt and load every named skill before implementation. Run focused
red and green `npm run ops:reconcile-test`, changed-region Prettier comparisons,
JS syntax checks, `npm run lint`, `npm run typecheck`, `npm run build`, help and
`git diff --check`. Run each independent offline stage of `ops:check`, inspect
every result, and omit online `ops:audit` under the existing metadata-disclosure
restriction; do not claim aggregate success or a fresh vulnerability inventory.
Keep logs in `/tmp`. Record execution failures and unchanged permitted retries.

Self-review the complete diff, then dispatch an independent read-only reviewer
with baseline SHA, working diff, this prompt, compatibility rules and actual
checks. Apply `receiving-code-review`, fix verified issues and recheck; request
follow-up review for significant changes. After review record behavior, fixtures,
compatibility, SDK limitation, checks and ordinary revert rollback in
`docs/operations.md`, plus concise records in `docs/build-plan.md`, Category 6
of `docs/launch-checklist.md`, and `docs/security.md`. Prompt 201, Category 6 live
operator approval and Phase 12 exit remain open. Stage only this prompt, utility,
spec and four docs, review the staged diff, and commit locally on main with
`caveman-commit`. Return commit ID and safe help/test inspection commands.

## SKILLS USED

- `architecture-patterns`: preserve pure comparison and adapter boundaries.
- `deployment-pipeline-design`: keep recovery evidence gates fail-closed.
- `error-handling-patterns`: reject malformed metadata before success/publication.
- `secrets-management`: keep errors free of private inventory/connection data.
- `security-best-practices`: secure-by-default checksum input validation.
- `javascript-testing-patterns`: rejection, compatibility and runner regressions.
- `requesting-code-review`: independent review after self-verification.
- `receiving-code-review`: verify feedback before fixes and re-verification.
- `caveman-commit`: required local Conventional Commit with security rationale.

Other full-phase skills are conditional: no server framework, SQL/schema,
workflow, telemetry/dashboard, SAST, browser/E2E, UI or durable architecture
decision changes. Load the owner if scope changes; do not broaden silently.
