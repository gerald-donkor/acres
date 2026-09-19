# 139 — export canonical mail transports tuple, support optional transporter injection, and add SmtpMailAdapter and MemoryMailAdapter unit tests

## Scope, and why it is next

The committed repository is on `main` at `6e25880`
(`refactor(storage): export methods tuple and tests`, the prompt 138 implementation).
The worktree is clean (verified this session via `git status`, clean output).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual type-narrowing and external
I/O adapter hardening through prompt 138.

There is no unbuilt ordered phase left in `docs/build-plan.md`. A comprehensive inspection
across all remaining external I/O and infrastructure adapters across the codebase reveals that:

1. Prompts 136, 137, and 138 hardened the external I/O ports and adapters of Phase 6:
   - Prompt 136 (`9a0c46d`): ClamAV scanner port canonical const tuples (`SCAN_STATUSES`,
     `SCAN_ERROR_CODES`) and dedicated unit tests (`server/src/scanner/clamav-scanner.adapter.spec.ts`).
   - Prompt 137 (`85a8534`): BullMQ queue port canonical const tuple (`QUEUE_JOB_NAMES`) and
     dedicated unit tests (`server/src/queue/bullmq-queue.adapter.spec.ts`).
   - Prompt 138 (`6e25880`): S3 object storage port canonical const tuple
     (`STORAGE_PRESIGNED_METHODS`), exported helper functions, and dedicated unit tests
     (`server/src/storage/s3-object-storage.adapter.spec.ts`).
2. An exhaustive scan across `server/src/` for all remaining adapter classes reveals exactly
   two adapters lacking dedicated unit test suites:
   - `SmtpMailAdapter` (`server/src/mail/adapters/smtp-mail.adapter.ts`): provides production
     and local SMTP delivery via Nodemailer. It currently has zero dedicated unit tests
     (`smtp-mail.adapter.spec.ts` does not exist).
   - `MemoryMailAdapter` (`server/src/mail/adapters/memory-mail.adapter.ts`): provides in-memory
     mail delivery for testing and local environments. It currently has zero dedicated unit tests
     (`memory-mail.adapter.spec.ts` does not exist; only tested transitively and partially through
     `mail.service.spec.ts`).
3. In `server/src/mail/mail.interface.ts`, `MailTransport` and `MailMessage` are defined, but the
   file does not export a canonical runtime const tuple `MAIL_TRANSPORTS = ['smtp', 'memory'] as const`
   or union type `MailTransportKind`. This contrasts with established patterns across domain ports
   (`STORAGE_PRESIGNED_METHODS`, `QUEUE_JOB_NAMES`, `SCHEDULED_JOB_NAMES`, `SCAN_STATUSES`,
   `SCAN_ERROR_CODES`, `JOB_RUN_STATUSES`, `AUDIT_ACTIONS`).
4. In `server/src/config/env.validation.ts`, `mailTransport: 'smtp' | 'memory'` repeats the raw literal
   union instead of consuming the canonical `MailTransportKind` type from `mail.interface.ts`.
5. In `server/src/mail/adapters/smtp-mail.adapter.ts`, the constructor instantiates `nodemailer.createTransport`
   directly without allowing an optional injected `Transporter` parameter. Adding an optional
   `transporter?: Transporter` parameter to the constructor enables both direct dependency injection
   for unit testing without mandatory module monkey-patching and maintains 100% backward compatibility
   with NestJS DI (where Nest provides `AcresConfigService` as the single required dependency).

This prompt completes the external I/O adapter unit testing and canonical tuple hardening for the
mail delivery subsystem across `SmtpMailAdapter` and `MemoryMailAdapter`.

Exporting `MAIL_TRANSPORTS` and `MailTransportKind`, supporting optional transporter injection, and
adding dedicated unit test suites for `SmtpMailAdapter` and `MemoryMailAdapter`:

- Exposes a canonical runtime array `MAIL_TRANSPORTS = ['smtp', 'memory'] as const` and type
  `MailTransportKind = (typeof MAIL_TRANSPORTS)[number]` for reflection, validation, and typing.
- Types `mailTransport` in `server/src/config/env.validation.ts` using `MailTransportKind` and validates
  environment configuration using `MAIL_TRANSPORTS`.
- Supports optional `transporter?: Transporter` in `SmtpMailAdapter` constructor for flexible DI and testing.
- Adds `server/src/mail/adapters/smtp-mail.adapter.spec.ts` covering:
  - Instantiation with Nodemailer transport when SMTP credentials (`smtpUser`, `smtpPass`) are present.
  - Instantiation with `auth: undefined` when credentials are not configured.
  - Instantiation with custom injected `Transporter`.
  - `send(message)` forwarding `to`, `subject`, `text`, and optional `html` to `transporter.sendMail`.
  - `send(message)` respecting explicit `message.from` when provided.
  - `send(message)` falling back to `config.mailFrom` when `message.from` is omitted.
  - Error propagation and structured logger output on `sendMail` failure with `Error` instances.
  - Error propagation and structured logger output on `sendMail` rejection with non-`Error` values.
- Adds `server/src/mail/adapters/memory-mail.adapter.spec.ts` covering:
  - Initial state: `sent` getter returns an empty readonly array.
  - `send(message)` records messages and logs delivery.
  - Object cloning on `send` ensuring subsequent mutations to input messages do not alter recorded state.
  - Multiple sequential `send` calls maintain correct message order and state.
  - `clear()` empties the stored messages list.
  - Full preservation of optional fields (`html`, `from`).
- Introduces zero breaking changes to public REST or GraphQL contracts (`npm run contracts:check`).

## Reference material read for it, by path

- `server/src/mail/mail.interface.ts`: `MailMessage`, `MailTransport`, and `MAIL_TRANSPORT` token definitions.
- `server/src/mail/adapters/smtp-mail.adapter.ts`: Nodemailer transport setup, logging, and error handling.
- `server/src/mail/adapters/memory-mail.adapter.ts`: In-memory recording, `sent` getter, and `clear()`.
- `server/src/mail/mail.service.ts`: `MailService` domain orchestration consuming `MAIL_TRANSPORT`.
- `server/src/mail/mail.service.spec.ts`: Existing test suite verifying `MailService` templates and reset URLs.
- `server/src/mail/mail.module.ts`: Dynamic provider selection factory for `MAIL_TRANSPORT`.
- `server/src/config/acres-config.service.ts`: SMTP and mail configuration getters (`mailTransport`, `smtpHost`, `smtpPort`, `smtpSecure`, `smtpUser`, `smtpPass`, `mailFrom`).
- `server/src/config/env.validation.ts`: Environment validation schema for `mailTransport` and SMTP settings.
- `server/src/storage/s3-object-storage.adapter.spec.ts`: Architectural reference for adapter unit tests (prompt 138).
- `server/src/queue/bullmq-queue.adapter.spec.ts`: Architectural reference for adapter unit tests (prompt 137).
- `server/src/scanner/clamav-scanner.adapter.spec.ts`: Architectural reference for adapter unit tests (prompt 136).
- `docs/backend.md`: Phase 3 and Phase 5 mail delivery records.
- `docs/build-plan.md`: Phase 3, Phase 5, and exit records §§16–22.

## Measurements and procedure

Verified by static typechecking, Jest execution, and AST inspection:

1. `server/src/mail/mail.interface.ts`:
   - Define and export `MAIL_TRANSPORTS`:
     ```ts
     export const MAIL_TRANSPORTS = ['smtp', 'memory'] as const;

     export type MailTransportKind = (typeof MAIL_TRANSPORTS)[number];
     ```
2. `server/src/config/env.validation.ts`:
   - Import `MAIL_TRANSPORTS` and `MailTransportKind` from `../mail/mail.interface`.
   - Update `AcresEnv.mailTransport`:
     ```ts
     mailTransport: MailTransportKind;
     ```
   - Validate `rawTransport` using `(MAIL_TRANSPORTS as readonly string[]).includes(rawTransport)`.
3. `server/src/mail/adapters/smtp-mail.adapter.ts`:
   - Update constructor signature to support optional `transporter`:
     ```ts
     constructor(
       private readonly config: AcresConfigService,
       transporter?: Transporter,
     ) {
       this.transporter =
         transporter ??
         nodemailer.createTransport({
           host: this.config.smtpHost,
           port: this.config.smtpPort,
           secure: this.config.smtpSecure,
           auth:
             this.config.smtpUser && this.config.smtpPass
               ? {
                   user: this.config.smtpUser,
                   pass: this.config.smtpPass,
                 }
               : undefined,
         });
     }
     ```
4. `server/src/mail/adapters/smtp-mail.adapter.spec.ts`:
   - Create isolated unit test file using `jest.mock('nodemailer')` and direct transporter mocks:
     - Verify default transport initialization with host, port, secure, and auth options.
     - Verify default transport initialization with auth undefined when credentials omitted.
     - Verify custom transporter injection bypasses `nodemailer.createTransport`.
     - Verify `send` forwards all fields (`to`, `subject`, `text`, `html`).
     - Verify `send` preserves explicit `from` or defaults to `config.mailFrom`.
     - Verify error logging and re-throwing on `Error` and non-`Error` rejections.
5. `server/src/mail/adapters/memory-mail.adapter.spec.ts`:
   - Create isolated unit test file:
     - Verify initial `sent` empty array.
     - Verify `send` records message and returns resolved Promise.
     - Verify cloned object immutability.
     - Verify multiple messages recorded in sequence.
     - Verify `clear()` resets stored messages to empty array.
6. Run lint, typecheck, builds, and server test suites:
   ```bash
   npm run lint
   npm run typecheck
   npm run build
   npm run test --workspace=@acres/server -- src/mail/adapters/smtp-mail.adapter.spec.ts src/mail/adapters/memory-mail.adapter.spec.ts src/mail/mail.service.spec.ts
   npm run test:server
   npm run contracts:check
   ```
7. Record results in `docs/backend.md`.

## Expected impact

- `server/src/mail/mail.interface.ts`: exports `MAIL_TRANSPORTS` and `MailTransportKind`.
- `server/src/config/env.validation.ts`: consumes canonical `MailTransportKind` and validates via `MAIL_TRANSPORTS`.
- `server/src/mail/adapters/smtp-mail.adapter.ts`: accepts optional `transporter` in constructor.
- `server/src/mail/adapters/smtp-mail.adapter.spec.ts`: new isolated unit tests for `SmtpMailAdapter`.
- `server/src/mail/adapters/memory-mail.adapter.spec.ts`: new isolated unit tests for `MemoryMailAdapter`.
- `docs/backend.md`: records canonical tuple export and unit test coverage.
- Zero changes to public HTTP routes, GraphQL schema, or database migrations.

## Non-goals

- Altering SMTP configuration environment variable names or default values.
- Introducing third-party mail vendor SDKs (e.g. SendGrid, Postmark, AWS SES); Nodemailer remains the provider-neutral abstraction.
- Modifying email templates in `MailService` (recovery and invitation templates remain byte-for-byte unchanged).
- Changing queue or storage adapters (already completed in prompts 137 and 138).

## Checks to run

```bash
npm run lint
npm run typecheck
npm run build
npm run test --workspace=@acres/server -- src/mail/adapters/smtp-mail.adapter.spec.ts src/mail/adapters/memory-mail.adapter.spec.ts src/mail/mail.service.spec.ts
npm run test:server
npm run contracts:check
```

Results are recorded in `docs/backend.md`.

## SKILLS USED

- `auth-implementation-patterns`: authentication and account invitation/recovery delivery patterns.
- `nestjs-best-practices`: NestJS provider, dependency injection, and adapter conventions.
- `javascript-testing-patterns`: isolated Jest unit test suite design, mock transporters, and assertion patterns.
- `error-handling-patterns`: structured logging and error re-throwing verification.
- `requesting-code-review`: preparing and requesting code review from reviewer subagent.
- `receiving-code-review`: evaluating and addressing reviewer feedback with technical rigor.
- `caveman-commit`: composing the final conventional commit message.
