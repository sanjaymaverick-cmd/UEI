# Operations and support runbook

## What's actually wired up

- `GET /v1/health` (no auth) pings the database with `SELECT 1` and returns the count of open
  reconciliation issues. It does not check Redis/the worker process — `apps/api` never talks to
  Redis directly, only `apps/worker` does. There is no separate worker health endpoint yet; use
  `docker compose ps` / process manager status for that, and watch the counter below for signs the
  worker has stopped draining.
- Unexpected (500) errors are logged server-side (`Errors` exception filter in
  `apps/api/src/application.ts`) before the client-facing response masks them. `DomainError`s and
  `ZodError`s are expected control flow and are not logged as errors.
- `apps/api` and `apps/worker` both install `process.on("unhandledRejection"/"uncaughtException")`
  handlers that `console.error` before whatever happens next, so a crash is never silent.
- There is **no external error-tracking, log aggregation, metrics, or alerting service wired in**
  (no Sentry/Datadog/PagerDuty). Right now "monitoring" means: poll `/v1/health`, and read the
  process logs directly (stdout/stderr — there is no log file or shipper). Adding a real
  alerting/on-call integration needs an actual account/API key for whichever service you pick;
  nothing here should be mistaken for one.

## Reading `/v1/health`

```json
{ "status": "ok", "mode": "simulator", "database": "ok", "openReconciliationIssues": 0 }
```

- `status: "degraded"` / `database: "unreachable"` — the database is down or unreachable. Nothing
  else in the response is meaningful in this state (the reconciliation count query never runs).
  Check `docker compose ps` for the `postgres` service and the API's own logs for connection
  errors.
- `openReconciliationIssues` — a non-zero, non-decreasing count over time means something is
  stuck and needs a human. A count that goes up and back down on its own is normal (see below —
  most reasons resolve themselves once the underlying condition clears).

## Reconciliation issues: what each reason means

`ReconciliationIssue` rows (visible per-transaction in the admin console's "Reconciliation"
panel, keyed by `transactionId` + `reason`) are the app's own anomaly signal — created by
`reconcile()` in `packages/domain/src/persistence.ts` whenever a request/callback/payment/session
doesn't resolve cleanly. Each reason is a prefix followed by a correlating ID.

**Self-healing — do not need investigation unless they persist for a long time:**

| Reason prefix | Meaning | Clears when |
|---|---|---|
| `TIMEOUT:<messageId>` | A protocol request (select/init/confirm/update) got no callback within `CALLBACK_TIMEOUT_MS`. | A late, valid callback for that message arrives. |
| `UNCERTAIN:<messageId>` | An outbox event's lease expired mid-processing, or a payment-auth call's outcome was unknown. Domain state is preserved; nothing is blindly retried. | The same event later completes cleanly. |
| `PAYMENT_TIMEOUT:<paymentId>` | A payment stayed in `AUTH_PENDING` past the callback timeout. | The payment authorization resolves (authorized or failed). |
| `SESSION_STATUS:<sessionId>` | A charging-session status poll didn't get an update, or a `status` callback found the session in an unexpected state. | A valid `update`/`status` callback lands for that session. |

**Do not self-heal — investigate directly:**

| Reason prefix | Meaning | Where to look |
|---|---|---|
| `OUT_OF_ORDER:<messageId>` | A callback arrived that didn't correlate to the current pending request (duplicate, stale, or genuinely out of order). Recorded, never applied. | `callbacks.ts`, `charging.ts` — check the transaction's message log in the admin trace for what else was in flight. |
| `PROVIDER_ERROR:<providerId>` | The provider returned an explicit error in a callback. | The `error` field on the stored callback payload, in the admin trace. |
| `EXPIRED_QUOTE:<messageId>` | An `init` succeeded after the selected quote had already expired. | `orders.ts` quote-expiry handling; likely a slow user or a too-short quote TTL. |
| `INVALID_METER:<messageId>` | A meter reading failed validation (regressed energy, timestamp out of order, non-zero energy on a `start`, or a reading too far in the future). | `charging.ts`'s validation block; check the provider's meter data quality. |
| `DISCOVERY_TIMEOUT` | A search's aggregation window closed with zero `on_search` callbacks received. | Provider/simulator connectivity for that search. |
| `SETTLEMENT_NOT_READY` | Settlement was attempted before the session was `COMPLETED` and the payment `AUTHORIZED`. Often a transient ordering issue; investigate if it doesn't disappear once both conditions are true. | `settlement.ts` `prepareSettlement`. |
| `TAX_POLICY_REQUIRED` | No exactly-one matching `TaxPolicy` row covers the session's end time. **Needs an operator to add/fix a `TaxPolicy` row** — this will never resolve on its own. | `prisma/seed.ts` / the `TaxPolicy` table directly. |
| `AMOUNT_EXCEEDS_AUTHORIZATION` | The computed bill exceeds the payment's authorized amount. Needs a business decision (raise authorization limits, adjust pricing, or accept the loss/manual capture). | `settlement.ts` `prepareSettlement`; compare `bill.totalPaise` to `payment.amountPaise`. |
| `CAPTURE_FAILED:<messageId>` / `RELEASE_FAILED:<messageId>` / `REFUND_FAILED:<messageId>` | The (simulator) settlement adapter reported failure for that money movement. | `settlement.ts` `SettlementService.process`; the corresponding `PaymentEvent` row has the adapter's response. |

To resolve any issue in this second table once you've fixed the underlying cause, clear it
directly: `UPDATE "ReconciliationIssue" SET "resolvedAt" = now() WHERE "transactionId" = '<id>' AND
reason = '<reason>';` (there is no admin-console button for this yet — it's a direct DB action).

## Local health/log checks

```powershell
Invoke-WebRequest http://127.0.0.1:3000/v1/health -UseBasicParsing | Select -Expand Content
docker compose logs -f postgres redis
```

The API and worker (`pnpm --filter @uei/api start`, `pnpm --filter @uei/worker start`) log to
stdout/stderr of whatever process manager runs them — there is no file-based log yet. If you add
one, prefer piping the process's own stdout rather than adding a logging library, unless/until
volume genuinely requires it.
