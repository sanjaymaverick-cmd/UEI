# PRODUCT REQUIREMENTS DOCUMENT (PRD)

## UEI EV Charging BAP — India

**Version:** 1.0  
**Status:** Approved baseline for design and engineering  
**Market:** India  
**Product Type:** Consumer EV charging interoperability application  
**Protocol Role:** Beckn Application Platform (BAP) on the Unified Energy Interface (UEI) ecosystem  
**Primary Platform:** Android-first mobile application  
**Secondary Platform:** Web-based internal operations console

---

# 1. PRODUCT VISION

Build a single consumer application through which an EV driver in India can discover compatible public charging stations across participating charging networks, initiate charging, pay using UPI, monitor the charging session, and receive transaction history and invoices without needing a separate application or wallet for every Charge Point Operator.

The intended consumer experience is:

> **Find → Arrive → Scan/Select → Pay → Charge → Stop → Invoice**

The product should make the underlying UEI, Beckn, BAP, BPP and CPO complexity invisible to the driver.

---

# 2. PRODUCT MISSION

Create an interoperable charging experience for the Indian EV ecosystem comparable in simplicity to interoperable digital payments.

The product should reduce:

- charging-network app fragmentation,
- dependence on proprietary CPO wallets,
- uncertainty around charger compatibility,
- failed payment/charging handoffs,
- fragmented charging receipts,
- difficulty identifying usable chargers while travelling.

The long-term product ambition is:

> **One trusted interface for EV charging across compatible Indian charging networks.**

---

# 3. PROBLEM STATEMENT

EV drivers frequently encounter fragmented charging experiences.

A driver may need to:

- identify which CPO operates a charger,
- download that operator's app,
- create an account,
- maintain another wallet,
- complete a separate KYC/payment process,
- understand connector terminology,
- navigate inconsistent charging workflows,
- retrieve receipts from multiple applications.

This creates unnecessary friction in a transaction that should simply involve locating an appropriate charger and paying for the electricity/charging service consumed.

The product solves this by providing one BAP interface that communicates with participating charging providers through UEI/Beckn.

---

# 4. PRODUCT PRINCIPLES

## 4.1 India First

The experience must be designed specifically around:

- UPI,
- Indian mobile numbers,
- Indian EV models,
- Indian connector standards,
- GST invoicing,
- Indian network conditions,
- Android-heavy consumer usage,
- Hindi and regional-language expansion.

---

## 4.2 No Proprietary Consumer Wallet

The MVP will not create a stored-value wallet.

Users should pay through supported UPI/payment mechanisms.

Where supported commercially and technically, **UPI Reserve Pay** is preferred for sessions where the final charge amount is unknown before charging starts.

NPCI's Reserve Pay framework supports reserving funds that can subsequently be debited against the reserve. 

---

## 4.3 Vehicle Compatibility Before Charger Complexity

Users should not normally have to determine connector compatibility manually.

The application should know the user's vehicle and preferentially show chargers compatible with that vehicle.

---

## 4.4 Network Interoperability Before Direct Hardware Integration

The MVP communicates through UEI/Beckn.

Direct OCPP integration with chargers is outside MVP scope.

---

## 4.5 Reliability Before Feature Breadth

The product must reliably handle:

- delayed callbacks,
- duplicate callbacks,
- payment timeouts,
- intermittent connectivity,
- inconsistent remote/local state,
- charger start/stop delays.

The application must never interpret a missing response as proof that an operation did not occur.

---

# 5. TARGET USERS

## 5.1 Primary Persona — Private EV Owner

Typical characteristics:

- owns a passenger EV,
- charges at home most days,
- occasionally uses public chargers,
- may travel between cities,
- wants a simple, reliable charging experience.

### Key needs

- compatible chargers nearby,
- availability,
- charger speed,
- tariff,
- directions,
- trusted payment,
- reliable charging start,
- transaction history.

---

## 5.2 Secondary Persona — Commercial EV Driver

Examples:

- taxi driver,
- fleet driver,
- delivery vehicle operator,
- independent commercial EV owner.

### Additional needs

- reliable charger discovery,
- low transaction friction,
- detailed charging history,
- downloadable receipts,
- GST details,
- expense records.

---

## 5.3 Future Persona — Fleet Operator

Future capabilities may include:

- multiple drivers,
- multiple vehicles,
- centralized billing,
- driver spending policies,
- consolidated invoices,
- charging analytics.

Fleet functionality is not required for MVP.

---

# 6. SUPPORTED VEHICLE CLASSES

The data model must eventually support:

- passenger cars,
- commercial four-wheelers,
- electric two-wheelers,
- electric three-wheelers,
- light commercial vehicles.

The first commercial release may prioritize passenger four-wheelers depending on UEI participant coverage.

---

# 7. CONNECTOR COMPATIBILITY

The platform must not assume CCS2 is the only relevant Indian charging interface.

BEE currently lists charging infrastructure including CCS, CHAdeMO, Type-2 AC, Bharat DC-001 and Bharat AC-001, while also allowing additional BIS/DST-approved standards. 

The product therefore requires a controlled vehicle compatibility database containing:

- manufacturer,
- model,
- variant,
- model year,
- battery capacity,
- AC charging capability,
- DC charging capability,
- supported connector types.

---

# 8. CORE CUSTOMER JOURNEY

```text
Open App
   ↓
Authenticate
   ↓
Select Vehicle
   ↓
View Compatible Chargers
   ↓
Select Station / Scan QR
   ↓
Review Live Quote
   ↓
Initialize Charging Order
   ↓
Approve Payment / UPI Authorization
   ↓
Confirm Order
   ↓
Start Charging
   ↓
Monitor Session
   ↓
Stop Charging
   ↓
Finalize Amount
   ↓
Settle Payment
   ↓
Receive Invoice
```

---

# 9. MVP FUNCTIONAL SCOPE

## FR-01 — Mobile Authentication

The user shall be able to authenticate using:

- Indian mobile number,
- OTP.

### Requirements

- OTP expiration,
- resend limits,
- rate limiting,
- device/session management,
- logout,
- refresh-token flow.

### Acceptance

A new user can authenticate without creating a password.

---

# 10. FR-02 — User Profile

The user shall have a basic account containing:

- mobile number,
- display name optional,
- email optional,
- preferred language,
- default vehicle,
- billing profiles.

---

# 11. FR-03 — Vehicle Setup

The application shall allow the user to select a vehicle from a controlled catalogue.

Selection hierarchy:

```text
Manufacturer
→ Model
→ Variant
→ Model Year if applicable
```

The application must derive compatible connectors from the selected vehicle.

### Manual entry

Manual vehicle entry may be offered only when the catalogue does not contain the vehicle.

Such entries should not automatically be considered verified for connector compatibility.

---

# 12. FR-04 — Charger Discovery

The user shall be able to search for charging stations based on location.

Search must use the UEI/Beckn discovery mechanism supported by the target network profile.

The Beckn ecosystem's implementation guidance expects consumer applications to map their search requirements into the relevant network implementation guide and map network responses back into application data. 

### Search result attributes

Where available:

- station name,
- provider,
- distance,
- location,
- connector,
- maximum power,
- availability,
- tariff,
- compatibility,
- last updated time.

---

# 13. FR-05 — Map and List View

Users shall be able to browse chargers using:

### Map

Pins showing compatible nearby stations.

### List

Sortable/filterable results.

Potential filters:

- distance,
- available now,
- charging power,
- connector type,
- provider,
- price.

---

# 14. FR-06 — Compatibility Filtering

By default:

> Only chargers compatible with the active vehicle should be prioritized/displayed.

The system must evaluate compatibility using:

```text
Vehicle capability
+
UEI charger/connector data
```

The user should not have to understand detailed connector specifications for ordinary usage.

---

# 15. FR-07 — Station Detail

Station detail shall show, where available:

- station/operator name,
- address,
- map location,
- distance,
- operating availability,
- individual charging points/connectors,
- power,
- connector type,
- current status,
- tariff,
- provider information,
- directions action.

---

# 16. FR-08 — QR Scanner

The application shall provide an integrated QR scanner.

The QR subsystem must attempt to resolve:

- provider,
- station,
- EVSE/charger,
- connector,
- UEI item reference.

A QR code that cannot be confidently resolved must not automatically create a charging transaction.

Fallback:

> Show nearby/discovered chargers or ask the user to choose the relevant charger.

---

# 17. FR-09 — Transaction-Specific Quote

Before payment or charging initiation, the system must request a fresh transaction-specific selection/quote.

Discovery-cache pricing must not be considered sufficient for financial commitment.

Conceptual flow:

```text
search
→ on_search

select
→ on_select
```

The returned quote must be stored as an immutable snapshot.

---

# 18. FR-10 — Order Initialization

After the user accepts the quote, the system shall initialize the charging order.

Conceptual UEI flow:

```text
init
→ on_init
```

The initialization stage must capture:

- selected item,
- provider,
- fulfillment data,
- user/billing details,
- payment terms,
- applicable order terms.

---

# 19. FR-11 — Payment-Term Resolution

The product shall inspect the payment terms received from the provider.

The application must support at least:

```text
BAP-collected payment
BPP-collected payment
```

Payment behavior must not be hard-coded to a single provider or payment method.

---

# 20. FR-12 — UPI Payment

The preferred Indian consumer payment method is UPI.

The payment layer must support provider adapters rather than embedding a specific gateway throughout application code.

Target architecture:

```text
Payment Orchestrator
     ↓
Payment Provider Adapter
     ↓
UPI/payment rails
```

---

# 21. FR-13 — UPI Reserve Pay

Where commercially and technically available, the platform should support UPI Reserve Pay.

Illustrative flow:

```text
Estimated maximum: ₹800
        ↓
Reserve ₹800
        ↓
Charging
        ↓
Actual bill ₹463
        ↓
Debit ₹463
        ↓
Release unused reserve
```

Reserve Pay implementation must remain capability-based rather than assumed available for every UEI transaction. 

---

# 22. FR-14 — Order Confirmation

Once applicable payment requirements have been satisfied:

```text
confirm
→ on_confirm
```

The product must distinguish:

```text
ORDER CONFIRMED
```

from:

```text
CHARGING STARTED
```

These are separate states.

---

# 23. FR-15 — Start Charging

Charging shall start only through the supported UEI fulfillment flow.

Conceptually:

```text
update(start-charging)
→ on_update
```

The mobile application must not declare charging active merely because the user pressed Start.

Charging becomes active only after the BAP has sufficient authoritative provider state.

---

# 24. FR-16 — Live Session Dashboard

During an active session the user should see, where available:

- charging state,
- duration,
- energy consumed,
- charging power,
- running/estimated cost,
- station,
- charger,
- payment authorization,
- connection/reconciliation state.

---

# 25. FR-17 — Live Updates

The application shall receive live session updates via:

```text
Server-Sent Events (SSE)
```

The system should support reconnection using:

```text
Last-Event-ID
```

so temporary mobile network loss does not destroy session continuity.

---

# 26. FR-18 — Stop Charging

The user shall be able to request charging termination.

Conceptual flow:

```text
Stop
 ↓
update(end-charging)
 ↓
on_update
```

The mobile UI should transition through:

```text
STOP REQUESTED
→ FINALIZING
→ ENDED
```

rather than immediately showing completion.

---

# 27. FR-19 — Weak-Network Recovery

If the phone loses internet access during charging:

- the charging session must not depend on the mobile connection remaining alive,
- the app should retain the session ID locally,
- the user should see the last known state,
- on reconnection, the app shall query the server for canonical state,
- SSE should resume.

The phone must never be the authoritative charging-state store.

---

# 28. FR-20 — Final Reconciliation

After charging ends, the platform must reconcile:

```text
Provider final energy/session data
        ↓
Final order amount
        ↓
Payment settlement
        ↓
Invoice amount
```

The system must detect mismatches rather than silently altering values.

---

# 29. FR-21 — Payment Settlement

If Reserve Pay or authorization/capture semantics are being used:

```text
AUTHORIZED
→ FINAL AMOUNT DETERMINED
→ DEBIT/CAPTURE
→ RELEASE UNUSED AUTHORIZATION
```

Unknown payment status must trigger reconciliation.

It must not trigger an automatic duplicate charge.

---

# 30. FR-22 — Transaction History

Users shall be able to view historical charging sessions.

Each entry should show:

- date,
- station,
- provider,
- duration,
- energy consumed,
- final amount,
- payment state,
- invoice.

---

# 31. FR-23 — GST Billing Profile

Users may save one or more billing profiles containing:

- legal/business name,
- GSTIN,
- billing address,
- state,
- state code where needed.

This is particularly useful for commercial users.

---

# 32. FR-24 — GST Invoice

The application shall make the provider/order invoice available after a successfully finalized transaction where applicable.

Invoices must be immutable snapshots.

Current GST Council material identifies battery charging of motor vehicles under SAC 998714 and records an 18% GST treatment, while recommending status quo when a reduction was considered. 

The application must therefore use configurable, effective-dated tax rules rather than hard-coding one GST rate forever.

---

# 33. FR-25 — Invoice Contents

Subject to applicable supplier/tax requirements, invoice data should support:

- invoice number,
- invoice date,
- seller name,
- seller GSTIN,
- buyer details,
- buyer GSTIN,
- station/provider,
- session reference,
- UEI/order reference,
- energy/charging quantity,
- taxable amount,
- CGST/SGST or IGST,
- total,
- payment reference.

---

# 34. FR-26 — Internal Operations Console

Operations staff require a web console.

Minimum modules:

```text
Dashboard
Transactions
Orders
Charging Sessions
Payments
Invoices
Protocol Messages
Reconciliation Issues
Providers
Users
System Health
```

---

# 35. FR-27 — Transaction Timeline

Operations staff must be able to view the complete chronological transaction.

Example:

```text
search
on_search
select
on_select
init
on_init
payment authorization
confirm
on_confirm
start request
on_update
meter/status events
stop request
on_update
payment finalization
invoice
```

This is mandatory for customer support and reconciliation.

---

# 36. UEI / BECKN ASYNCHRONOUS BEHAVIOR

The product shall treat Beckn interactions as asynchronous distributed transactions.

The system must persist:

- transaction ID,
- message ID,
- action,
- participant,
- request/callback,
- timestamp,
- payload,
- error,
- signature/schema status where available.

A network ACK must not be interpreted as completion of the underlying commercial action.

---

# 37. IDEMPOTENCY REQUIREMENT

All side-effecting commands must be idempotent.

Examples:

- confirmation,
- start charging,
- stop charging,
- payment authorization,
- debit/capture,
- refund.

Duplicate callbacks/webhooks must not duplicate financial or business side effects.

---

# 38. STATE MACHINES

## Order

```text
DRAFT
SELECT_PENDING
SELECTED
INIT_PENDING
INITIALIZED
PAYMENT_PENDING
CONFIRM_PENDING
CONFIRMED
COMPLETED
CANCELLED
FAILED
```

---

## Fulfillment

```text
NOT_STARTED
START_REQUESTED
CHARGING
STOP_REQUESTED
ENDED
FAILED
UNKNOWN
```

---

## Payment

```text
CREATED
AUTH_PENDING
AUTHORIZED
DEBIT_PENDING
CAPTURE_PENDING
CAPTURED
RELEASE_PENDING
RELEASED
REFUND_PENDING
PARTIALLY_REFUNDED
REFUNDED
FAILED
```

Order, payment and fulfillment states must not be collapsed into one generic session status.

---

# 39. MVP OUT OF SCOPE

The following are specifically excluded:

- proprietary stored-value wallet,
- direct OCPP charger integration,
- charger hardware administration,
- advanced route planning,
- automatic battery SoC route optimization,
- charger installation marketplace,
- loyalty/rewards,
- fleet ERP,
- energy trading,
- charger-owner dashboard,
- microservices architecture.

---

# 40. ADVANCE BOOKING

Advance charger reservation is not part of the MVP.

The current product shall focus on:

```text
Discover
→ Arrive
→ Select/Scan
→ Charge
```

rather than promising reservation capability that is not consistently supported across the target UEI charging flow.

---

# 41. NON-FUNCTIONAL REQUIREMENTS

## NFR-01 — Availability

Target early production application/API availability:

```text
≥ 99.5%
```

excluding planned maintenance and external participant outages.

---

## NFR-02 — Performance

Internal APIs:

```text
P95 < 500 ms
```

for operations not waiting on external networks.

Discovery is asynchronous and should return a search handle immediately.

---

## NFR-03 — Search Experience

First meaningful charger results target:

```text
< 5 seconds
```

where network participants respond promptly.

Search should continue aggregating results during the configured discovery window.

---

## NFR-04 — Durability

PostgreSQL is the local source of truth.

Redis shall not hold the only copy of:

- order state,
- payment state,
- invoices,
- protocol audit,
- session history.

---

## NFR-05 — Financial Integrity

Money must use integer minor units.

Example:

```text
₹463.72
=
46372 paise
```

Floating-point types must not be used for authoritative payment amounts.

---

## NFR-06 — Metering Integrity

Energy values shall use decimal precision suitable for meter readings.

---

## NFR-07 — Security

Required:

- TLS,
- secure secret management,
- OTP abuse protection,
- token rotation,
- RBAC for admin,
- payment webhook verification,
- Beckn message verification,
- audit logs,
- encryption at rest,
- minimal PII retention.

---

## NFR-08 — Observability

Every transaction must be traceable using identifiers such as:

```text
traceId
transactionId
messageId
orderId
sessionId
paymentId
providerId
```

---

# 42. RECONCILIATION REQUIREMENTS

The system shall proactively identify states such as:

```text
CONFIRM_PENDING too long

START_REQUESTED without confirmation

STOP_REQUESTED without confirmation

AUTHORIZED payment with abandoned order

ENDED charging session without final payment

CAPTURED payment without invoice

invoice total != payment amount
```

Such cases shall create reconciliation issues for automated or manual handling.

---

# 43. FAILURE UX

Users should see understandable messages.

Never show raw protocol errors such as:

```text
BPP NACK 30001
```

Translate them into outcomes such as:

> This charger is currently unavailable. Please choose another charger.

Major error categories:

```text
CHARGER_UNAVAILABLE
PAYMENT_FAILED
PAYMENT_PENDING
PROVIDER_UNAVAILABLE
START_FAILED
SESSION_INTERRUPTED
FINALIZATION_PENDING
```

---

# 44. FINALIZATION-PENDING EXPERIENCE

A session may physically end while network or payment settlement remains incomplete.

The application must support a state similar to:

> Charging completed. We are confirming the final amount with the charging provider.

The system must not falsely label such transactions as failed.

---

# 45. PRIMARY PRODUCT SCREENS

## Consumer App

1. Splash/Auth
2. OTP
3. Vehicle onboarding
4. Home charger map
5. Charger list
6. Station detail
7. QR scanner
8. Quote/payment review
9. UPI approval handoff
10. Charging dashboard
11. Finalizing screen
12. Completion screen
13. Activity/history
14. Invoice
15. Vehicles
16. Profile/billing

---

# 46. HOME SCREEN REQUIREMENT

The home experience should answer four questions immediately:

```text
Where can I charge?
Can my vehicle use it?
Is it available?
What will it cost?
```

Example:

```text
AVAILABLE

ABC Charging Hub
1.6 km

CCS2 · 60 kW
₹18/kWh

Compatible with your vehicle

[Navigate]   [View]
```

---

# 47. PRODUCT LANGUAGE

Consumer-facing terminology should use:

- charger,
- charging station,
- start charging,
- stop charging,
- payment,
- final amount,
- invoice.

Do not expose:

- BAP,
- BPP,
- Beckn transaction ID,
- fulfillment,
- on_select,
- on_update,

except in support/technical tools.

---

# 48. INDIA LANGUAGE STRATEGY

MVP:

```text
English
```

Recommended early expansion:

```text
Hindi
```

Architecture must permit additional regional-language resource files without changing core screens.

---

# 49. SUCCESS METRICS

## North-Star Metric

### Successful Interoperable Charging Sessions

Percentage of valid charging attempts through participating providers that successfully begin charging.

---

## Funnel

Measure:

```text
Search
→ Station viewed
→ Quote obtained
→ Payment authorized
→ Order confirmed
→ Charging started
→ Charging completed
→ Payment finalized
→ Invoice issued
```

---

## Key Metrics

- discovery response rate,
- compatible chargers returned per search,
- quote success rate,
- payment authorization success,
- order confirmation success,
- charging-start success,
- session completion success,
- reconciliation success,
- median time to charging start,
- sessions requiring manual intervention,
- repeat usage,
- provider coverage.

---

# 50. INITIAL MVP TARGETS

These are product targets, not contractual guarantees:

```text
Payment authorization success      > 95%
Confirmed-order → charge start     > 95%
Financial auto-reconciliation      > 98%
Duplicate financial transactions   0
Lost charging records              0
```

Targets should be refined after sandbox and pilot data.

---

# 51. RELEASE MILESTONES

## Milestone 1 — Protocol Proof

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

Success means the application can conduct and audit a real UEI discovery-to-initialization transaction.

---

## Milestone 2 — Transaction Proof

Add:

```text
Payment
→ Confirm
→ on_confirm
```

---

## Milestone 3 — Charging Proof

Add:

```text
Start
→ Active session
→ Status updates
→ Stop
```

---

## Milestone 4 — Financial Closure

Add:

```text
Final reconciliation
→ UPI settlement
→ invoice
```

---

## Milestone 5 — Pilot Ready

Requires:

- operations console,
- monitoring,
- reconciliation,
- duplicate handling,
- retry/recovery strategy,
- security review,
- support workflow.

---

# 52. MVP RELEASE ACCEPTANCE CRITERIA

The MVP is not considered complete until all of these work against the target UEI testing/pilot environment:

```text
✓ OTP authentication
✓ vehicle compatibility
✓ UEI discovery
✓ asynchronous multiple-provider responses
✓ station selection
✓ current quote
✓ order initialization
✓ payment terms resolution
✓ UPI payment/authorization
✓ order confirmation
✓ charging start
✓ live state
✓ charging stop
✓ final session amount
✓ payment finalization
✓ transaction history
✓ invoice
✓ callback duplication handling
✓ webhook duplication handling
✓ timeout reconciliation
✓ complete audit timeline
```

---

# 53. KEY PRODUCT RISKS

## Risk 1 — UEI Participant Coverage

A technically excellent BAP has limited consumer value if participating charger coverage is low.

### Mitigation

Track:

```text
cities covered
stations covered
active providers
charger availability quality
```

as product metrics.

---

## Risk 2 — Stale Charger Availability

Discovery responses may become outdated before a user arrives.

### Mitigation

Perform a fresh selection/quote before commitment.

Clearly distinguish live versus recently reported state.

---

## Risk 3 — Variable Provider Behaviour

Different BPPs may implement edge cases differently.

### Mitigation

Provider-specific compatibility testing and strict protocol normalization.

---

## Risk 4 — Payment Ambiguity

Payment can succeed while the client receives a timeout.

### Mitigation

Provider status reconciliation before any retry.

---

## Risk 5 — Physical Charger Failure

An order may be confirmed while the charger cannot start.

### Mitigation

Keep order, payment and fulfillment states separate and implement recovery/refund/release logic.

---

## Risk 6 — Weak Mobile Network

Charging locations may have poor cellular connectivity.

### Mitigation

Server-side authoritative state and mobile reconnection support.

---

## Risk 7 — Tax/Regulatory Changes

GST and payment/network rules may evolve.

### Mitigation

Effective-dated configurable policy tables instead of hard-coded rules.

---

# 54. PRODUCT DEPENDENCIES

The product depends on:

- target UEI implementation profile,
- Beckn participant onboarding,
- Beckn-ONIX configuration,
- UEI sandbox/pilot availability,
- participating BPP/CPO implementations,
- mobile OTP provider,
- UPI/payment service provider,
- map/geocoding provider,
- cloud infrastructure,
- GST/tax requirements.

The implementation must use the exact UEI implementation guide/configuration applicable to the network being joined, consistent with Beckn's own guidance for application developers. 

---

# 55. FUTURE PHASE — PHASE 2

After transaction reliability is proven:

### Consumer

- Hindi interface,
- regional languages,
- favorite stations,
- saved routes,
- charger issue reporting,
- station reliability information,
- availability notifications.

### Commercial

- monthly expense summaries,
- corporate profiles,
- consolidated billing,
- expense export.

### Fleet

- organizations,
- drivers,
- vehicles,
- spending controls,
- consolidated invoices.

---

# 56. FUTURE PHASE — INTELLIGENCE

Only after sufficient reliable data exists:

- predicted charger availability,
- charger reliability scoring,
- estimated queue/waiting time,
- recommended charging stations,
- route + charging planning,
- trip energy estimation.

These recommendations must not replace authoritative provider availability or tariff information.

---

# 57. PRODUCT NON-GOAL

This product is not intended initially to become:

- a charger CPO,
- an OCPP backend,
- a charging-hardware management platform,
- an electricity retailer,
- a fleet ERP,
- a stored-value wallet.

It is a **consumer interoperability layer**.

---

# 58. CORE PRODUCT DIFFERENTIATOR

The product's defensibility should progressively come from:

```text
UEI interoperability
+
India vehicle compatibility
+
payment orchestration
+
reconciliation reliability
+
cross-network charging history
+
superior consumer UX
```

The map alone is not the product.

---

# 59. FINAL PRODUCT DEFINITION

### Internal definition

> An India-first UEI consumer BAP that orchestrates EV-charger discovery, order creation, charging fulfillment, UPI payment, reconciliation and invoicing across participating charging providers.

### Consumer definition

> **One app to find and charge your EV across compatible charging networks — with UPI.**

---

# 60. PRODUCT FOUNDATION

The product must optimize for four things above everything else:

```text
INTEROPERABILITY
RELIABILITY
PAYMENT INTEGRITY
SIMPLICITY
```

A technically successful product is one where the user does not need to understand the complexity underneath.

The desired experience is simply:

> **Open the app. Find a compatible charger. Pay with UPI. Charge. Drive.**

This PRD should now sit **above the Implementation Specification v1** as the product source of truth: the PRD defines *what and why*; the implementation specification defines *how*.