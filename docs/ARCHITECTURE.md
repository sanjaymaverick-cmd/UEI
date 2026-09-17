# First milestone architecture

Implementation design derived from PRD.md, BLUEPRINT.md and CODEX_MASTER_PROMPT.md on 2026-09-16. This is a new implementation document, not a recovered approved specification.

The API and worker are separate NestJS processes in a modular monolith. Domain services own Prisma access; controllers perform input/authentication checks and delegate. PostgreSQL owns identity, sessions, vehicles, discovery, orders, protocol records, inbox/outbox, audit history and reconciliation issues. Redis/BullMQ schedules worker wake-ups; the database remains authoritative if Redis is unavailable.

Commands atomically persist business state, an outgoing protocol message and an outbox record. Workers claim records with a compare-and-set lease, perform transport work outside the transaction, and persist the submission outcome. A crash or ambiguous transport result is reconciled, never blindly resent. Incoming callbacks atomically persist an inbox record, raw message, validated business transition and audit event. Unique callback keys and serializable transactions protect duplicate and concurrent processing.

Search accepts multiple providers during a bounded aggregation window. Results use normalized connector types and are scoped to the requesting user's vehicle. Select creates a distinct stable order transaction. Init uses the same order transaction and a fresh message ID. Quotes are append-only snapshots with integer INR paise and an expiry; energy uses database Decimal columns.

Authentication uses expiring opaque access tokens and rotating opaque refresh tokens stored only as keyed hashes. Refresh-token reuse revokes the session family. OTP challenges have expiry, attempt limits and a request cooldown. The fixed-code development provider is restricted to development/test and must never be exposed publicly. Admin access is assigned only when a development account is first created from the configured admin phone.

The simulator is an explicitly non-network UEI test adapter. Its normalized envelopes are not a certified UEI wire profile. Live mode fails closed until a pinned profile, ONIX deployment, trust configuration and verified mappings are supplied. No payment capture or charger control is implemented.

The mobile client uses React Navigation, TanStack Query and Expo SecureStore. Android is the initial validation target; shared code is platform-neutral. The admin application exposes authenticated transaction timelines. Canonical HTTP reads support recovery; durable audit events are available through authenticated SSE with cursor replay.

Future payment, invoice and live charging models/services are deferred until the first slice is validated. They must retain independent state machines and exact financial/metering precision.
