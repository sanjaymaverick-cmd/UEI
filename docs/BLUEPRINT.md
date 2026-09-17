# UEI EV Charging BAP — Product & Delivery Blueprint

**Version:** 1.0  
**Market:** India  
**Repository:** `sanjaymaverick-cmd/UEI`  
**Local Workspace:** `D:\work Dir\UEI`  
**Role:** Consumer Beckn Application Platform (BAP) on UEI

## 1. Product Objective

Build an India-first consumer EV charging platform through which a driver can:

**Find → Select → Pay → Charge → Stop → Settle → Invoice**

across participating UEI charging networks without maintaining separate CPO applications or wallets.

Consumer proposition:

> **One app. Compatible chargers. UPI payment. Charge and drive.**

The application hides UEI, Beckn, BAP, BPP, CPO and payment orchestration complexity from the consumer.

---

## 2. Product North Star

The map is not the core product.

The core product is reliable cross-network transaction orchestration:

```text
INTEROPERABILITY
       +
PAYMENT INTEGRITY
       +
CHARGING RELIABILITY
       +
RECONCILIATION
       +
CONSUMER SIMPLICITY
```

North-star metric:

> Successful interoperable charging sessions across participating UEI providers.

---

## 3. Primary User Journey

```text
Open App
   ↓
Mobile OTP
   ↓
Select Vehicle
   ↓
Discover Compatible Chargers
   ↓
Navigate to Station
   ↓
Select Charger / Scan QR
   ↓
Fresh Quote
   ↓
Initialize Order
   ↓
Resolve Payment Terms
   ↓
UPI Authorization / Payment
   ↓
Confirm Order
   ↓
Start Charging
   ↓
Live Charging Session
   ↓
Stop Charging
   ↓
Final Reconciliation
   ↓
Exact Payment Settlement
   ↓
GST Invoice
```

---

## 4. Product Principles

### India First

Design specifically for:

- Indian EV models
- UPI
- GST
- Indian mobile numbers
- Android-first users
- variable connectivity at charging locations
- multilingual expansion

### No Proprietary Wallet

Do not require customers to maintain a stored balance.

Prefer interoperable UPI payment mechanisms.

### Vehicle-Aware Discovery

The consumer should not need expert knowledge of connector standards.

```text
Vehicle
  ↓
Known capabilities
  ↓
Compatible chargers
```

### UEI First

MVP interoperability happens through UEI/Beckn.

Direct charger/OCPP integrations remain out of scope.

### Reliability Before Feature Breadth

A smaller product that reliably completes charging transactions is preferable to a feature-rich application with uncertain payment or fulfillment state.

---

## 5. MVP Scope

### Consumer

- mobile OTP authentication
- user profile
- vehicle catalogue
- vehicle compatibility
- charger discovery
- map/list
- availability and tariff display
- charger details
- QR scanner/resolver
- fresh quote
- order initialization
- UPI payment
- Reserve Pay capability where supported
- order confirmation
- charging start
- live session
- charging stop
- final settlement
- session history
- billing profiles
- GST invoice

### Operations

- dashboard
- transaction timeline
- orders
- charging sessions
- payments
- invoices
- Beckn messages
- reconciliation issues
- providers
- users
- system health

---

## 6. MVP Exclusions

Do not build initially:

- CPO wallet
- direct OCPP backend
- charger management
- fleet ERP
- loyalty system
- charger marketplace
- energy trading
- SoC route planner
- predictive routing
- microservices
- advance charger booking unless supported by the target UEI profile

---

## 7. Vehicle Compatibility Blueprint

```text
VehicleMake
   ↓
VehicleModel
   ↓
VehicleVariant
   ↓
VehicleConnectorCapability[]
```

Vehicle metadata may include:

- battery capacity
- connector types
- AC maximum charge rate
- DC maximum charge rate
- model-year range

User vehicle:

```text
UserVehicle
- user
- verified vehicle variant
- registration number optional
- nickname
- default flag
```

---

## 8. UEI Transaction Blueprint

```text
search
 ↓
on_search[]

select
 ↓
on_select

init
 ↓
on_init

Payment Terms
 ↓
UPI

confirm
 ↓
on_confirm

update(start-charging)
 ↓
on_update

status / on_status
 ↓
Live Session

update(end-charging)
 ↓
on_update

Final Reconciliation
 ↓
Payment Settlement
 ↓
Invoice
```

Important rules:

- ACK does not mean business success.
- `on_confirm` does not mean electricity is flowing.
- charging ending does not mean financial completion.
- remote uncertainty must be reconciled before retry.

---

## 9. Payment Blueprint

```text
PaymentOrchestrator
       │
       ├── UPI Reserve Pay Adapter
       ├── Standard UPI Adapter
       ├── BPP-Collected Adapter
       └── Future Provider Adapter
```

Common operations:

```text
authorize()
verify()
debit()
capture()
release()
refund()
getStatus()
verifyWebhook()
```

Preferred variable-value pattern where supported:

```text
Reserve maximum
      ↓
Charging
      ↓
Calculate actual bill
      ↓
Debit exact amount
      ↓
Release remainder
```

Never mark a payment successful only because the UPI app returns control to the mobile application.

---

## 10. Business State Machines

### Order

```text
DRAFT
→ SELECT_PENDING
→ SELECTED
→ INIT_PENDING
→ INITIALIZED
→ PAYMENT_PENDING
→ CONFIRM_PENDING
→ CONFIRMED
→ COMPLETED
```

Additional states:

```text
CANCELLED
FAILED
```

### Fulfillment

```text
NOT_STARTED
→ START_REQUESTED
→ CHARGING
→ STOP_REQUESTED
→ ENDED
```

Additional:

```text
FAILED
UNKNOWN
```

### Charging Session

```text
PENDING
→ STARTING
→ ACTIVE
→ STOPPING
→ ENDED
```

### Payment

```text
CREATED
→ AUTH_PENDING
→ AUTHORIZED
→ DEBIT_PENDING / CAPTURE_PENDING
→ CAPTURED
→ RELEASE_PENDING
→ RELEASED
```

Additional:

```text
REFUND_PENDING
PARTIALLY_REFUNDED
REFUNDED
FAILED
```

These state machines remain separate.

---

## 11. Domain Model

```text
User
UserVehicle
BillingProfile

VehicleMake
VehicleModel
VehicleVariant
VehicleConnectorCapability

NetworkParticipant

DiscoveryRequest
DiscoveryResult

BecknTransaction
BecknMessage

Order
QuoteSnapshot
Fulfillment

ChargingSession
SessionEvent
MeterReading

Payment
PaymentAttempt
PaymentEvent
Refund

Invoice
TaxPolicy

InboxEvent
OutboxEvent
IdempotencyKey
WebhookEvent
ReconciliationIssue
AuditLog
```

---

## 12. Source-of-Truth Rules

### PostgreSQL

Authoritative for:

- users
- orders
- charging sessions
- protocol messages
- payments
- invoices
- reconciliation

### Redis

Allowed for:

- BullMQ
- short-lived cache
- locks
- rate limits
- OTP state
- SSE fan-out

Redis must never contain the only durable copy of business state.

---

## 13. Monetary and Metering Rules

Currency:

```text
₹463.72
=
46372 paise
```

Use integer minor units.

Do not use floating-point values for settlement.

Energy:

Use fixed decimal precision for:

- kWh
- kW
- meter values

---

## 14. Inbox / Outbox

### Incoming

```text
UEI / ONIX
   ↓
Callback
   ↓
Validate
   ↓
Deduplicate
   ↓
Inbox
   ↓
DB transaction
   ├─ BecknMessage
   ├─ Domain transition
   └─ Outbox event
```

### Outgoing

```text
Outbox
 ↓
Worker
 ↓
ONIX
 ↓
UEI
```

---

## 15. Idempotency

Side-effect operations require idempotency protection:

- confirm
- charging start
- charging stop
- payment authorization
- debit
- capture
- refund

Duplicate callbacks must not cause duplicate domain changes.

Duplicate payment webhooks must not create duplicate money movement.

---

## 16. Live Session Blueprint

```text
BPP / UEI
   ↓
BAP Session Projection
   ↓
Redis
   ↓
SSE
   ↓
Mobile
```

Endpoint concept:

```text
GET /v1/sessions/:id/events
```

Support:

```text
Last-Event-ID
```

for reconnection.

---

## 17. Weak Connectivity

If the phone loses internet:

```text
Phone Offline
   ↓
Charging continues remotely
   ↓
BAP maintains state
   ↓
Phone reconnects
   ↓
GET canonical session
   ↓
Resume SSE
```

Mobile state is never authoritative.

---

## 18. Reconciliation Blueprint

Automatically identify:

```text
SELECT_PENDING too long
INIT_PENDING too long
CONFIRM_PENDING too long
START_REQUESTED without confirmation
STOP_REQUESTED without confirmation

AUTHORIZED payment without charging
ENDED session without settlement
CAPTURED payment without invoice
invoice != captured amount
```

Unknown does not equal failed.

Unknown means:

```text
RECONCILE
```

---

## 19. Tax and Invoice Blueprint

Use an effective-dated tax-policy model.

Do not permanently hard-code GST assumptions.

Invoice snapshots should preserve:

- seller data
- buyer data
- GSTIN
- place/state information
- tax classification
- taxable amount
- CGST/SGST/IGST
- final total
- payment reference
- UEI/order reference
- charging quantity

Historical invoices remain immutable.

---

## 20. Delivery Phases

### Phase 1 — UEI Protocol

```text
OTP
→ Vehicle
→ Search
→ on_search
→ Select
→ on_select
→ Init
→ on_init
```

### Phase 2 — Payment and Confirmation

```text
Payment
→ Confirm
→ on_confirm
```

### Phase 3 — Charging

```text
Start
→ Live
→ Status
→ Stop
```

### Phase 4 — Closure

```text
Reconcile
→ Settle
→ Invoice
```

### Phase 5 — Pilot Hardening

- operations console
- provider certification/testing
- monitoring
- security
- support
- recovery automation

---

## 21. Repository Blueprint

Target repository:

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
└── docs/
    ├── PRD.md
    ├── BLUEPRINT.md
    ├── ARCHITECTURE.md
    └── IMPLEMENTATION_SPEC.md
```

---

## 22. Architecture Decisions

Locked baseline:

- React Native
- Android first
- TypeScript
- NestJS
- modular monolith
- separate API and worker processes
- PostgreSQL
- PostGIS
- Prisma
- Redis
- BullMQ
- SSE
- Beckn-ONIX
- payment adapters
- UPI-first
- Reserve Pay capability abstraction
- Inbox/Outbox
- idempotency
- immutable financial snapshots
- India vehicle master
- reconciliation engine

---

## 23. Blueprint Definition of Done

For every attempted charging transaction, durable records must answer:

- who initiated it?
- which vehicle?
- which UEI transaction?
- which BPP?
- which charger?
- which quote?
- which payment terms?
- what payment authorization?
- was the order confirmed?
- did charging start?
- what occurred during charging?
- did charging end?
- what was the final amount?
- how much was debited?
- was remaining authorization released?
- was an invoice issued?
- were discrepancies detected?

If this can be reconstructed without depending on transient application logs, the blueprint has been implemented correctly.
