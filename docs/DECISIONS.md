# UEI EV Charging BAP — Locked Architecture Decisions

Recorded: 2026-09-16.
Source: approved BLUEPRINT.md, particularly section 22; cross-platform clarification from CODEX_MASTER_PROMPT.md.
This document summarizes the approved baseline. The recording date is not an inferred approval date.

## 1. Mobile and Platform Strategy

Use React Native and shared TypeScript for Android and iOS. Android is the first implementation and validation target. Use Expo Development Build, React Navigation, TanStack Query, and secure token storage as specified in the master prompt. Isolate platform-specific native behavior and keep the iOS structure intact.

Reason: deliver Android first while preserving shared implementation for iOS.
Alternatives excluded: Android-only architecture requiring a later rewrite.
Consequence: validate Android first and validate iOS on a suitable build environment after the first Android milestone.

## 2. Application Architecture

Use a NestJS modular monolith with separate API and worker processes and a lightweight internal admin console. Organize the monorepo with pnpm and Turborepo.

Reason: clear domain boundaries with manageable delivery and operations.
Alternatives excluded: MVP microservices.
Consequence: thin controllers, domain-owned data access, and no external HTTP calls inside database transactions.

## 3. Authoritative Storage

Use PostgreSQL, PostGIS, and Prisma. PostgreSQL is authoritative for business records. Redis supports BullMQ, cache, locks, rate limits, OTP state, and SSE fan-out.

Reason: durable state must survive transient infrastructure loss.
Alternatives excluded: Redis as the only durable business store.
Consequence: persist protocol, transaction, payment, invoice, and reconciliation records in PostgreSQL.

## 4. UEI Protocol Boundary

Use Beckn-ONIX and a versioned UEI adapter. Keep protocol payload construction and version-specific behavior behind the adapter.

Reason: UEI interoperability without coupling business logic to protocol details.
Alternatives excluded: direct OCPP integration in the MVP and duplicated protocol machinery in domain services.
Consequence: persist requests and callbacks; a protocol ACK is not business success.

## 5. Independent State Machines

Separate Order, Fulfillment, Charging Session, and Payment state machines.

Reason: confirmation, electricity flow, session end, and financial completion are distinct events.
Alternatives excluded: a single session status representing every lifecycle.
Consequence: explicit, auditable transitions and reconciliation of disagreement.

## 6. Reliable Asynchronous Processing

Use durable Inbox/Outbox, callback deduplication, idempotency, and a reconciliation engine.

Reason: callbacks can repeat or arrive late; external operations can succeed despite local timeouts.
Alternatives excluded: treating timeout or unknown state as proof of failure.
Consequence: protect irreversible commands and reconcile uncertainty before retrying.

## 7. Payments

Use UPI-first payment orchestration behind provider adapters, with Reserve Pay capability abstraction where supported. Resolve BAP/BPP collection and payment terms from initialization. Do not require a proprietary consumer wallet.

Reason: support variable-value charging across different payment capabilities.
Alternatives excluded: assuming every provider supports Reserve Pay or treating app-return navigation as payment proof.
Consequence: verify payment server-side; support authorization, debit/capture, release, refunds, and status checks through adapters.

## 8. Financial and Metering Precision

Use integer paise for INR and fixed Decimal precision for authoritative energy and meter values. Preserve immutable quote and financial snapshots.

Reason: exact settlement and reconstructable financial history.
Alternatives excluded: Float for money or authoritative energy settlement.
Consequence: reconciliation compares exact persisted values.

## 9. Live Sessions and Connectivity

Use a canonical backend session projection and SSE, with Redis fan-out and Last-Event-ID reconnection support.

Reason: charging must remain trackable while the consumer phone is offline.
Alternatives excluded: authoritative mobile state or direct mobile coupling to BPP callbacks.
Consequence: fetch canonical session state on reconnect and resume events.

## 10. Indian Vehicle Compatibility

Maintain VehicleMake → VehicleModel → VehicleVariant → VehicleConnectorCapability and user vehicle selections.

Reason: show chargers compatible with the driver's vehicle.
Alternatives excluded: designing compatibility around a single connector or free-text names.
Consequence: normalize connector types and maintain Indian vehicle master data.

## 11. Tax and Invoices

Use effective-dated TaxPolicy and immutable invoice snapshots.

Reason: preserve the tax treatment and parties applicable to each completed transaction.
Alternatives excluded: permanently hard-coded GST assumptions.
Consequence: preserve seller/buyer, classification, tax components, payment/order references, and charging quantity.

## 12. Delivery Gate

First deliver OTP → vehicle → search/on_search → select/on_select → init/on_init, plus an admin transaction trace, before actual payment capture and charging control.

Reason: prove protocol orchestration and durable tracing first.
Consequence: later phases add payments, charging, settlement/invoices, and pilot hardening.

## 13. Change Control

For changes to this baseline, record the decision, reason, alternatives considered, consequence, and date. Provider selection, credentials, protocol profile configuration, and verified toolchain versions remain implementation prerequisites rather than invented locked choices.
