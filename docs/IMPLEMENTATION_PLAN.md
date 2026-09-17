# Milestone implementation checklist

The derived ARCHITECTURE.md and IMPLEMENTATION_SPEC.md are present. The simulator HTTP journey and database durability suite are validated. Real network integration, native device validation, and the complete Docker/Redis deployment remain delivery gates.

## Milestone 1 — Protocol Proof (complete)

- [x] Scaffold pnpm/Turbo, Nest API/worker, Expo app, React admin, shared domain packages.
- [x] Add PostgreSQL/PostGIS schema, migration, fixture seed and validated environment.
- [x] Implement OTP, persisted sessions, refresh rotation, authorization and secure mobile storage.
- [x] Implement vehicle selection, asynchronous multi-provider discovery, immutable quotes and initialization.
- [x] Persist Inbox/Outbox, deduplicate callbacks, audit transitions, reconcile uncertainty and replay SSE.
- [x] Exercise simulator failure scenarios and test security/durability boundaries.
- [x] Run available checks and document exact outcomes and missing Android/iOS/infrastructure tooling.
- [x] Verify the standalone Redis/BullMQ worker process end-to-end against a live Postgres + Redis (docker-compose), not only the in-process test harness (2026-09-16).

Real payment capture and physical charger control were outside this milestone.

## Milestone 2 — Transaction Proof: payment/confirm (complete)

- [x] Extend `UeiChargingProtocol` + the simulator adapter with `confirm`/`on_confirm` (`packages/domain/src/protocol.ts`, `packages/domain/src/core.ts`).
- [x] Add `Payment`, `PaymentAttempt`, `PaymentEvent`, `Refund` models and migration `20260916170207_add_payments` (schema only for `Refund`; refund/capture/release flows remain future work).
- [x] Build a Payment Orchestrator + provider-adapter interface (`packages/domain/src/payments.ts`): UPI first, Reserve Pay capability-gated by whether `on_init` returned `maximumAuthorizationPaise`.
- [x] Wire order `INITIALIZED → PAYMENT_PENDING → CONFIRM_PENDING → CONFIRMED` via a new `PAYMENT_AUTH` outbox kind processed by `OutboxWorker`, followed by an enqueued `confirm` protocol request and its `on_confirm` callback.
- [x] Extend admin trace (`TraceService`, admin console) and tests to cover payment states, NACK-on-confirm handling, and payment-authorization timeout reconciliation (`PAYMENT_TIMEOUT:` issues).
- [x] Extend mobile `QuoteScreen` with an "Approve UPI payment" action and PAYMENT_PENDING/CONFIRM_PENDING/CONFIRMED/FAILED states.

Validation (2026-09-16): 29 Vitest tests passed (6 new: 2 unit + 4 database-backed covering authorize+confirm, decline, confirm-NACK, and payment-timeout reconciliation), ESLint passed, and all seven workspace TypeScript checks passed. Payment capture/release/refund lifecycle, real UPI PSP integration, and charging fulfillment remain out of scope for this milestone.

## Milestone 3 — Charging Proof (complete)

- [x] `Fulfillment`, `ChargingSession`, `MeterReading`, `SessionEvent` schema (migration `202609170001_charging_settlement`).
- [x] `update(start-charging)` / `on_update` and `update(end-charging)` / `on_update` protocol actions (`packages/domain/src/charging.ts`).
- [x] Live session dashboard + SSE session projection on mobile (`ActiveChargingScreen`, `useOrder` hook, `apps/mobile/src/useOrder.ts`).

## Milestone 4 — Financial Closure (complete)

- [x] `Invoice`, `TaxPolicy` schema (effective-dated GST rules) (`packages/domain/src/settlement.ts`).
- [x] Final reconciliation of provider energy/session data against order amount (`AMOUNT_EXCEEDS_AUTHORIZATION` reconciliation issue in `prepareSettlement`).
- [x] Payment capture/release against the `AUTHORIZED` payment created in Milestone 2; `Refund` flow (`SettlementService`, admin refund endpoint and console panel).

Validation (2026-09-17): all seven workspace TypeScript checks passed, ESLint passed, and 35 Vitest tests passed (6 test files, including the database-backed `charging.test.ts` and `integration.test.ts` suites) against isolated PostgreSQL with all three committed migrations and fixture seed. Fixed two environment-specific test flakes uncovered during validation: `atomic()` now passes `maxWait: 10000` to `$transaction` (`packages/database/src/index.ts`), and `pnpm test` now passes `--testTimeout=15000` — both address a cold-connection-pool cost on the first serializable transaction of a freshly started test file on this machine, not a logic defect. Extended the admin console with charging-session, invoice, and refund-issuing panels, which were the one gap between the backend/mobile work and the admin trace already returning that data. Real UPI/tax-policy/PSP integration, native Android/iOS execution, and live ONIX interoperability remain out of scope / unverified.

## Milestone 5 — Pilot Ready (not started)

- [ ] Real Beckn-ONIX signing/schema-validation/routing (currently `infra/onix/` is a placeholder README only).
- [ ] Native Android emulator/device run (never executed; simulator/API-only so far).
- [ ] iOS build validation pass.
- [x] `.github/workflows` CI: typecheck, lint and the full test suite (including the opt-in database tests) against Postgres/PostGIS and Redis service containers on every push/PR to `master` (`.github/workflows/ci.yml`).
- [ ] Security review, monitoring, support workflow.

## Continuation: mobile session recovery (2026-09-16)

- Share refresh requests and reuse rotated credentials for delayed unauthorized responses.
- Preserve local sign-in after temporary refresh transport/server failures; clear it after rejected refresh credentials.
- Prevent pending refresh/restoration from restoring a logged-out session or retrying a command under another sign-in.
- Serialize secure-storage updates and clear local credentials before remote logout.
- Add mobile API regression tests, including command idempotency preservation.

Validation: 16 Vitest tests passed, ESLint passed, and all seven workspace TypeScript checks passed. Four database integration tests were skipped and require the opt-in dedicated test database; native Android/iOS execution is a separate validation step. See the root README for current commands.

## Continuation: HTTP simulator journey (2026-09-16)

- Extract the configured API factory so tests start the same application on an ephemeral loopback port.
- Exercise OTP sign-in, credential rotation/logout, strict request validation, and callback/admin authorization over HTTP.
- Validate discovery, select, initialization, quote preservation, idempotency, cross-user isolation, admin trace, and SSE cursor replay.
- Validate the database name before test writes and serialize suites that share the outbox.
- Synchronize test outbox draining with request availability instead of assuming two immediate ticks always complete delivery.

Validation: all 23 tests passed, including four domain database tests and three HTTP tests, against isolated PostgreSQL 18.4 with the committed migration and fixture seed. ESLint and all seven workspace TypeScript checks passed. The HTTP suite invokes the domain worker directly and accelerates simulator callbacks. Docker/PostGIS, the Redis worker process, native Android/iOS, and live ONIX interoperability remain unverified.

## Continuation: Redis worker verification and Milestone 2 payment/confirm (2026-09-16)

- Verified the standalone `apps/worker` process end-to-end against the docker-compose Postgres and Redis containers (BullMQ `outbox-tick` scheduler live in Redis, a real HTTP-driven search drained by the real worker process, not the test harness's in-process shortcut).
- Extended the protocol layer, order state machine, and simulator with `confirm`/`on_confirm`.
- Added `Payment`, `PaymentAttempt`, `PaymentEvent`, `Refund` Prisma models and migration `20260916170207_add_payments`, applied to both `uei` and `uei_test`.
- Added a Payment Orchestrator behind a `PaymentProviderAdapter` interface with a simulator-backed UPI adapter; Reserve Pay capability is selected when `on_init` returns `maximumAuthorizationPaise`.
- Wired `POST /v1/orders/:id/pay` and a new `PAYMENT_AUTH` outbox kind so `OutboxWorker` authorizes payment, then enqueues `confirm`, mirroring the existing select/init pattern (never an external call inside a DB transaction; idempotent via the existing `Idempotency-Key` mechanism).
- Extended admin trace and the admin console with a payment panel; extended mobile `QuoteScreen` with an "Approve UPI payment" step and the new order states.

Validation: 29 Vitest tests passed (23 prior + 6 new), ESLint passed, and all seven workspace TypeScript checks passed, against isolated PostgreSQL with the two committed migrations. Payment capture/release/refund, charging fulfillment, real UPI PSP integration, and native Android/iOS execution remain out of scope / unverified.
