# First milestone implementation specification

Derived implementation specification, 2026-09-16. See ARCHITECTURE.md for provenance and boundaries.

## HTTP contract

All routes are under `/v1`. Authenticated routes use `Authorization: Bearer <accessToken>`. Consumer data is always filtered by the authenticated user. JSON bodies reject unknown fields. Errors contain `code`, `message`, and `retryable`.

- POST `/auth/request-otp`: `{phone}` in +91 format.
- POST `/auth/verify-otp`: `{phone, otp}` returns tokens and user.
- POST `/auth/refresh`: `{refreshToken}` rotates both tokens.
- POST `/auth/logout`: `{refreshToken}` revokes the session family.
- GET `/vehicles/catalogue`; GET/POST `/vehicles` (POST `{variantId, nickname}`).
- POST `/charging/search`: `{vehicleId, latitude, longitude}` returns a persisted search immediately.
- GET `/charging/search/:id/results`: compatible results and aggregation status.
- POST `/orders`: `{discoveryResultId, vehicleId}` with `Idempotency-Key`.
- GET `/orders`; GET `/orders/:id`.
- POST `/orders/:id/init`: empty JSON with `Idempotency-Key`.
- GET `/transactions/:id/events`: authenticated SSE; `Last-Event-ID` is an audit sequence.
- GET `/admin/transactions`; GET `/admin/transactions/:id`: admin-only persisted trace.
- POST `/callbacks`: normalized simulator callback, protected by callback secret; not a public UEI ingress.

Order states: SELECT_PENDING -> SELECTED -> INIT_PENDING -> INITIALIZED. Provider errors/NACK can produce FAILED; a missing callback creates a reconciliation issue while preserving the pending state. Late valid order callbacks may resolve uncertainty. Out-of-order callbacks are stored and flagged without advancing state. Search callbacks after the aggregation window are stored but do not change results.

Idempotency keys are scoped to actor and command, bound to a canonical request hash, and persisted with the command result. Reuse with a changed request is a conflict. Callback keys include provider, transaction, action and message ID; changed content with the same key is rejected.

Simulator scenarios: normal, duplicate, late, missing, nack, callback-error, out-of-order. Simulator tariffs, vehicles, station coordinates and payment terms are test fixtures, not commercial or manufacturer-verified data.

Validation includes domain boundary tests, compile/lint/build checks and an opt-in PostgreSQL integration suite. Docker, Android SDK and an emulator/device are external prerequisites; no platform validation is implied by a successful TypeScript build.
