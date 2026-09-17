You are the principal engineer responsible for beginning implementation of an India-first UEI EV Charging BAP product.

Project repository:
`https://github.com/sanjaymaverick-cmd/UEI`

Local working directory:
`D:\work Dir\UEI`

Primary product documents to treat as source of truth:
- `docs/PRD.md`
- `docs/BLUEPRINT.md`
- `docs/ARCHITECTURE.md`
- `docs/IMPLEMENTATION_SPEC.md`

If any of those files are missing, create them from the approved project specification before beginning implementation.

# PRODUCT GOAL

Build a cross-platform mobile EV charging application for India that operates as a consumer Beckn Application Platform (BAP) on the Unified Energy Interface (UEI).

The long-term mobile product must support:

- Android
- iOS

However, development must begin with **Android as the primary implementation and validation platform**.

The architecture must remain cross-platform from Day 1.

Do not make Android-only architectural decisions that would require rewriting the mobile application for iOS later.

Use React Native and shared TypeScript code for both platforms.

# CORE CONSUMER EXPERIENCE

The desired user flow is:

```text
OTP Login
→ Select Vehicle
→ Discover Compatible Chargers
→ View Charger Details
→ Select Charger / Scan QR
→ Obtain Fresh Quote
→ Initialize UEI Order
→ Resolve Payment Terms
→ Approve UPI Payment
→ Confirm Order
→ Start Charging
→ Monitor Live Session
→ Stop Charging
→ Reconcile Final Amount
→ Settle Payment
→ Receive GST Invoice
```

The user should never need to understand:

- Beckn
- UEI protocol internals
- BAP
- BPP
- fulfillment
- protocol callbacks

Those concepts belong to the backend and operations tooling.

# PRIMARY TECH STACK

Use:

## Mobile
- React Native
- Expo Development Build
- TypeScript
- React Navigation
- TanStack Query
- secure token storage
- cross-platform abstractions for Android and iOS

Android is the first active target.

iOS support must remain build-compatible where practical.

## Backend
- Node.js
- TypeScript
- NestJS

## Database
- PostgreSQL
- PostGIS
- Prisma

## Async Infrastructure
- Redis
- BullMQ

## UEI / Beckn
- Beckn-ONIX
- UEI protocol adapter abstraction

## Live session
- Server-Sent Events

## Admin
- lightweight web-based internal operations console

## Repository structure
Use a monorepo with pnpm and Turborepo.

# TARGET REPOSITORY STRUCTURE

Create or align to:

```text
UEI/
│
├── apps/
│   ├── api/
│   ├── worker/
│   ├── mobile/
│   └── admin/
│
├── packages/
│   ├── config/
│   ├── database/
│   ├── auth/
│   ├── users/
│   ├── vehicles/
│   ├── discovery/
│   ├── beckn/
│   ├── uei/
│   ├── orders/
│   ├── fulfillment/
│   ├── charging/
│   ├── payments/
│   ├── invoices/
│   ├── reconciliation/
│   ├── notifications/
│   ├── observability/
│   └── shared/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── infra/
│   ├── docker/
│   ├── onix/
│   ├── nginx/
│   └── scripts/
│
├── docs/
│
├── .github/
│   └── workflows/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── docker-compose.yml
```

# ARCHITECTURAL RULES

These are non-negotiable.

1. Use a modular monolith.
2. Keep mobile cross-platform.
3. Android is first priority, not Android-only.
4. PostgreSQL is the source of truth.
5. Redis is not authoritative storage.
6. No Float for money.
7. Use integer paise for INR.
8. Use Decimal for energy and metering.
9. Separate Order, Fulfillment, Charging Session, and Payment state machines.
10. Persist every Beckn request and callback.
11. Use Inbox/Outbox patterns.
12. Use idempotency on all irreversible commands.
13. Never treat a timeout as proof that an external operation failed.
14. Unknown external state must trigger reconciliation.
15. Payment provider logic must sit behind adapters.
16. UEI protocol version logic must sit behind an adapter.
17. Controllers must remain thin.
18. No direct Prisma access across domain boundaries.
19. No external HTTP call inside a DB transaction.
20. Every important state change must be auditable.

# FIRST DEVELOPMENT OBJECTIVE

Do not try to build the entire product immediately.

The first milestone is:

```text
OTP Login
→ Vehicle Selection
→ UEI Search
→ on_search
→ Select
→ on_select
→ Init
→ on_init
→ Admin transaction trace
```

This vertical slice must work reliably before implementing actual payment capture or charging control.

# PHASE 1 — PROJECT BOOTSTRAP

Begin by inspecting the repository.

If the repository is empty, initialize it.

Create:

- pnpm workspace
- Turborepo config
- TypeScript base config
- linting
- formatting
- environment validation
- `.env.example`
- Git ignore rules
- Docker Compose
- PostgreSQL
- Redis
- NestJS API
- NestJS worker
- React Native mobile app
- admin app shell

The repository must start locally from documented commands.

# PHASE 2 — DATABASE FOUNDATION

Implement Prisma schema for:

## Identity
- User
- user sessions if required
- BillingProfile

## Vehicles
- VehicleMake
- VehicleModel
- VehicleVariant
- VehicleConnectorCapability
- UserVehicle

## Protocol
- NetworkParticipant
- BecknTransaction
- BecknMessage

## Discovery
- DiscoveryRequest
- DiscoveryResult

## Order
- Order
- QuoteSnapshot

## Fulfillment
- Fulfillment

## Charging
- ChargingSession
- MeterReading
- SessionEvent

## Payment
- Payment
- PaymentAttempt
- PaymentEvent
- Refund

## Billing
- Invoice
- TaxPolicy

## Reliability
- InboxEvent
- OutboxEvent
- IdempotencyKey
- WebhookEvent
- ReconciliationIssue
- AuditLog

Generate initial migration.

Create seed data for a small Indian EV vehicle catalogue.

# PHASE 3 — MOBILE FOUNDATION

Build the mobile app as cross-platform React Native, but validate Android first.

Create these screens:

1. Splash
2. Mobile Number
3. OTP Verification
4. Vehicle Selection
5. Home Map placeholder
6. Charger List placeholder
7. Charger Detail placeholder
8. QR Scanner placeholder
9. Quote screen placeholder
10. Active Charging placeholder
11. Activity
12. Vehicles
13. Profile

Do not spend time on visual polish yet.

Priority:

- navigation
- state flow
- API contracts
- loading/error states
- Android emulator/device stability

Make sure platform-specific code is isolated.

For example:

```text
src/platform/
src/native/
```

or equivalent abstraction.

Do not directly couple shared feature code to Android-only APIs.

# PHASE 4 — AUTHENTICATION

Implement mobile-number OTP auth with an abstraction:

```ts
interface OtpProvider {
  requestOtp(phone: string): Promise<void>;
  verifyOtp(phone: string, otp: string): Promise<boolean>;
}
```

Use a local/dev provider initially if credentials are unavailable.

Create endpoints:

```text
POST /v1/auth/request-otp
POST /v1/auth/verify-otp
POST /v1/auth/refresh
POST /v1/auth/logout
```

Use:

- access token
- refresh token
- token rotation
- secure storage on mobile

# PHASE 5 — VEHICLE DOMAIN

Implement:

```text
VehicleMake
→ VehicleModel
→ VehicleVariant
→ VehicleConnectorCapability
```

Build mobile flow:

```text
Choose Make
→ Model
→ Variant
→ Save Vehicle
```

The active vehicle determines connector compatibility.

# PHASE 6 — UEI PROTOCOL CORE

Create:

```ts
interface UeiChargingProtocol {
  search(...): Promise<ProtocolSubmission>;
  select(...): Promise<ProtocolSubmission>;
  init(...): Promise<ProtocolSubmission>;
  confirm(...): Promise<ProtocolSubmission>;
  requestStart(...): Promise<ProtocolSubmission>;
  requestStop(...): Promise<ProtocolSubmission>;
  status(...): Promise<ProtocolSubmission>;
}
```

Implement:

```text
UeiEvChargingV1Adapter
```

Keep raw Beckn/UEI message construction inside this adapter.

Do not expose raw protocol payload construction to controllers.

# PHASE 7 — BECKN CONTEXT

Create a central BecknContextFactory.

It should generate:

- transaction_id
- message_id
- action
- version
- domain
- BAP ID
- BAP URI
- BPP ID where known
- BPP URI where known
- timestamp
- TTL
- location context where required

Generate a new `message_id` for each protocol action.

Keep `transaction_id` stable for the logical transaction.

# PHASE 8 — BECKN-ONIX

Add local ONIX integration under:

```text
infra/onix/
```

Create required Docker/config structure.

Use ONIX for:

- signing
- signature verification
- schema validation
- routing

Do not recreate those capabilities in application services unless absolutely required.

# PHASE 9 — INBOX / OUTBOX

Implement durable Inbox and Outbox services.

Incoming flow:

```text
callback
→ validate
→ deduplicate
→ InboxEvent
→ BecknMessage
→ domain transition
→ Outbox event
→ ACK
```

Outgoing flow:

```text
domain command
→ DB transaction
→ OutboxEvent
→ worker
→ ONIX
→ UEI
```

# PHASE 10 — DISCOVERY

Implement:

```text
POST /v1/charging/search
GET /v1/charging/search/:searchId/results
```

The POST endpoint should return quickly.

Do not block waiting for `on_search`.

Flow:

```text
Mobile
→ search request
→ DiscoveryRequest
→ Outbox
→ Worker
→ UEI search
```

Then:

```text
on_search
→ persist BecknMessage
→ persist DiscoveryResult[]
→ expose through results API
```

Support multiple `on_search` callbacks for one search.

Implement a configurable discovery aggregation window.

# PHASE 11 — VEHICLE COMPATIBILITY

Filter discovery results using the user's active vehicle.

Default UI should prioritize/show compatible connectors.

Do not rely solely on free-text connector names.

Normalize connector types.

# PHASE 12 — ORDER SELECT

Implement:

```text
POST /v1/orders
```

Input:

- discoveryResultId
- vehicleId

Flow:

```text
Create Order
→ SELECT_PENDING
→ select
→ on_select
→ QuoteSnapshot
→ SELECTED
```

Store quote snapshots immutably.

# PHASE 13 — INIT

Implement:

```text
POST /v1/orders/:orderId/init
```

Flow:

```text
SELECTED
→ INIT_PENDING
→ init
→ on_init
→ INITIALIZED
```

Persist raw payment terms.

Create:

```ts
interface PaymentTermsResolver
```

Normalize the response into:

- BAP or BPP collector
- payment method
- prepayment requirement
- maximum authorization if applicable

# PHASE 14 — ADMIN TRANSACTION TRACE

Before moving to payments, implement an internal transaction viewer.

For each transaction show:

```text
timestamp
action
direction
message_id
transaction_id
provider
ACK/NACK
raw payload
normalized state transition
error
```

Show chronological timeline.

This is required before Phase 1 is considered complete.

# PHASE 15 — ANDROID-FIRST BUILD REQUIREMENTS

Initially prioritize:

- Android Studio emulator
- physical Android device
- Android permissions
- QR/camera support
- secure storage
- deep linking for UPI
- SSE reconnection
- background/foreground transitions

However:

- keep iOS project intact
- do not remove iOS build files
- use cross-platform libraries where possible
- isolate Android-only native logic
- document any Android-only temporary implementation

Every Android-only shortcut must contain a clear TODO explaining the cross-platform equivalent required for iOS.

# PHASE 16 — IOS READINESS

Do not actively optimize iOS in the first sprint, but ensure:

- TypeScript shared code remains platform-neutral
- API layer is shared
- state machines are shared
- TanStack Query layer is shared
- navigation architecture works cross-platform
- native abstractions do not assume Android
- payment adapter API allows iOS UPI/app handoff differences
- QR scanning library supports both platforms where practical

After Android Phase 1 passes, run the iOS project through build validation and fix structural compatibility issues before major feature expansion.

# CODING STANDARDS

Use:

- strict TypeScript
- dependency injection
- small domain services
- explicit DTO validation
- explicit state transitions
- structured logging
- typed errors
- unit tests
- integration tests

Avoid:

- `any`
- large controllers
- business logic in React components
- direct DB access from controllers
- giant service classes
- hidden state transitions

# TEST REQUIREMENTS

At minimum, write tests for:

## State transitions
- valid transitions
- invalid transitions

## Protocol
- duplicate callback
- late callback
- callback error
- NACK
- missing callback

## Discovery
- multiple `on_search` messages
- duplicate result
- connector mismatch

## Database
- Inbox deduplication
- Outbox creation
- transaction consistency

## Mobile
- auth navigation
- vehicle selection
- API failure states

# ERROR MODEL

Create a normalized error model such as:

```ts
interface DomainError {
  code: string;
  message: string;
  retryable: boolean;
  consumerMessage: string;
  technicalDetails?: unknown;
}
```

Initial codes:

```text
AUTH_OTP_INVALID
AUTH_RATE_LIMITED
VEHICLE_NOT_SUPPORTED
DISCOVERY_TIMEOUT
NO_COMPATIBLE_CHARGERS
CHARGER_UNAVAILABLE
QUOTE_EXPIRED
ORDER_SELECT_FAILED
ORDER_INIT_FAILED
PROVIDER_UNAVAILABLE
UEI_PROTOCOL_ERROR
```

# OBSERVABILITY

Every protocol/business log should include relevant IDs:

```text
traceId
transactionId
messageId
orderId
providerId
userId
action
```

Do not log:

- OTP values
- access tokens
- refresh tokens
- secrets
- sensitive payment credentials

# LOCAL DEVELOPMENT

The local project root is:

```text
D:\work Dir\UEI
```

Create a README with exact Windows development commands.

Target developer workflow:

```text
git clone
pnpm install
docker compose up -d
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev
```

If those exact commands need adjustment, document the actual working commands.

# GITHUB

Repository:

```text
https://github.com/sanjaymaverick-cmd/UEI
```

Work in small, logical commits.

Suggested first commits:

```text
chore: initialize UEI monorepo
feat: add database and prisma foundation
feat: add mobile auth and vehicle onboarding
feat: add Beckn transaction persistence
feat: add UEI search and on_search
feat: add order select and quote flow
feat: add init and payment terms
feat: add admin transaction timeline
```

# DOCUMENTATION

Maintain:

```text
docs/PRD.md
docs/BLUEPRINT.md
docs/ARCHITECTURE.md
docs/IMPLEMENTATION_SPEC.md
docs/DECISIONS.md
docs/LOCAL_DEVELOPMENT.md
```

When making an important architecture decision, record:

```text
decision
reason
alternatives considered
consequence
date
```

# FIRST SPRINT DEFINITION OF DONE

Do not declare the first sprint complete until this real vertical slice works:

```text
OTP Login
→ Save User
→ Select Vehicle
→ Search UEI
→ Receive one or more on_search responses
→ Show compatible charger results
→ Select charger
→ Send select
→ Receive on_select
→ Persist immutable quote
→ Send init
→ Receive on_init
→ Normalize payment terms
→ Inspect complete transaction in admin console
```

Additionally:

```text
✓ Docker/local environment works
✓ migrations work from a clean DB
✓ seed works
✓ Android application runs
✓ iOS structure remains intact
✓ protocol messages are persisted
✓ duplicate callback handling works
✓ asynchronous callbacks work
✓ transaction timeline works
✓ tests pass
✓ README accurately explains setup
```

# EXECUTION METHOD

Begin by inspecting the current repository.

Do not assume files exist.

Then:

1. report current repo state,
2. create an implementation checklist,
3. bootstrap only what is missing,
4. implement the first vertical slice,
5. run tests,
6. run the Android application,
7. fix compile/runtime issues,
8. update documentation,
9. commit logical milestones.

Do not jump directly into payment or live charging until `search → on_search → select → on_select → init → on_init` is functioning and auditable.

Do not replace real protocol state transitions with mocked success responses once the UEI protocol layer is connected.

If UEI sandbox credentials or external secrets are missing, build a clean adapter/mock boundary so development can continue, clearly label mocked infrastructure, and leave the real integration path intact.

# FINAL PRINCIPLE

This application must be engineered as:

> a reliable distributed transaction orchestrator with a cross-platform mobile interface,

not merely:

> a charger map connected to APIs.

Optimize the implementation around:

```text
DURABLE STATE
+
IDEMPOTENCY
+
AUDITABILITY
+
RECONCILIATION
+
CROSS-PLATFORM MOBILE DESIGN
```

Begin implementation now from the repository root.
