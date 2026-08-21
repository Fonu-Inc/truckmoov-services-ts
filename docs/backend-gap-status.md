# Backend Data Requirements — remaining work

Source: `TruckMoov — Backend Data Requirements`, 21 August 2026. 35 screens with
no backend support, ~250 concerns in the "Notes for the backend developer"
sections.

Status legend: ✅ done · 🟡 partly done · ⛔ not started · 🚫 blocked on a decision

---

## Defects found in shipped code

All nine are fixed. Two carry a blocked second half.

| Id | Defect | Status |
|---|---|---|
| X1 | Wallet top-up never credited the wallet | ✅ settlement path, idempotent |
| X1b | Nothing initiates the mobile-money charge | 🚫 which provider? |
| X2 | KYC documents could never leave `pending` | ✅ review, approve, reject |
| X2b | Tenant-level verified rollup | 🚫 required document set per organisation type |
| X3 | Document metadata lost on restart | ✅ persisted, factory-bound |
| X4 | Vehicle quota never enforced | ✅ enforced on create, 409 |
| X5 | Vehicle cap served as device and SIM caps | ✅ no longer aliased |
| X6 | Fleet audit log was an in-process array | ✅ append-only table |
| X7 | Compliance reminders sent nothing | ✅ digest per tenant, over SMTP |
| X8 | Support tickets could not be assigned | ✅ assignee validated as staff |
| X9 | Renewal destroyed the previous certificate | ✅ supersedes, history endpoint |

One trivial item left: `POST /fleet/compliance/reminders/send` is the only
compliance endpoint that omits `OWNER_OPERATOR` from `@Roles`. Probably
unintended, though the reminder is server-driven anyway.

---

## Foundations

| Id | Foundation | Status | Notes |
|---|---|---|---|
| F1 | Organisation-relationship model | ✅ cancelled | Aggregator and owner-operator are independent roles. Nothing links them. |
| F2 | Money type and effective-dated rates | 🟡 | Kobo confirmed as the convention. The effective-dated rate table is not built. |
| F3 | Invoice numbering, three gapless series | ⛔ | Screens 2, 3, 14 |
| F4 | Communications wallet ledger | ⛔ | Absent entirely. Screens 3, 5, 6, 7, 23 |
| F5 | Entitlement and quota service | 🟡 | Vehicle cap enforced. No single entitlement source yet. |
| F6 | Immutable audit trail | 🟡 | Fleet and console durable. Auth `activity_logs` still a mutable table. |
| F7 | Secret storage, write-only | ⛔ | Screens 7, 10, 14, 17, 28, 32, 33, 34 |
| F8 | Provider-callback idempotency | 🟡 | Wallet settlement is idempotent. Not yet a shared primitive. |
| F9 | One device-lifecycle vocabulary | ⛔ | Screens 9 and 19 disagree on values and casing |
| F10 | Notification and delivery log | 🟡 | Email channel now exists. No queryable delivery history: the Go outbox is Redis-only with no list operation. |

---

## Enforcement

Every one of these changes a path that already carries traffic.

| Id | Task | Status |
|---|---|---|
| E1 | Refuse a send at the spending or credit limit | ⛔ needs F4 |
| E2 | Refuse a create at a plan quota | 🟡 vehicles done; job cap and API quota open |
| E3 | Gate provisioning on KYC verified | 🚫 needs X2b |
| E4 | Refuse service use by a suspended tenant | ⛔ |
| E5 | Refuse an AI call outside the allowed model list | ⛔ |
| E6 | Block an IP address at the edge | ⛔ |
| E7 | Attachment scanning and size cap server-side | ⛔ |
| E8 | Validate webhook target URLs against internal addresses | ⛔ |

---

## Shared patterns

| Id | Pattern | Status |
|---|---|---|
| P1 | Review, then await an external decision | 🟡 KYC review built; not generalised to screens 16, 27, 30, 31 |
| P2 | Read model as a query over existing stores | ⛔ |
| P3 | Pass a third party's rejection reason through verbatim | ⛔ |

---

## Screens

**Done**

- 13 Owner-Operator Compliance Documents — the doc blamed a missing organisation
  model; the real gaps were X7 and X9, both fixed. Existing tenant scoping covers
  the rest.
- 18 Platform Data Bundles Catalog — platform-side list added.
- 25 KYC Review Workflow — review path built. Tenant-level rollup still 🚫 X2b.

**Dropped**

- 12 Aggregator Network Overview — every panel aggregates across linked
  operators, and nothing links them. Awaiting final confirmation.

**Next, no dependencies**

- 20 Settings — Platform Currency and Exchange Rate. Shrinks to almost nothing
  once TD-2 lands: the rate panel hides and only the default currency remains.
- 21 Subscription Plan Pricing — needs D8 and D9.
- 26 KYC Notification History — needs F10's delivery log.
- 27 Organisation Upgrade Queue — simpler without an organisation model. Needs D12.

**Needs the money and wallet foundations**

3 Communications Wallet · 16 Channel Providers · 22 Communication Pricing ·
23 Tenant Wallet Management · 24 Tiered Service Plans · 29 Phone Number Inventory ·
30 SMS Sender ID Approvals · 31 WhatsApp Sender Management

**Needs a Go service change**

6 Voice and IVR · 8 Job Offers · 9 Device Installation · 19 Platform Devices

**Large, confirm scope first**

1 Sustainability Dashboard · 2 Waybills and Invoices · 4 Fatigue Detection ·
5 Campaigns · 7 Email and Omnichannel Inbox · 10 ERP Connectors ·
11 Support Tickets · 14 Platform Billing · 15 Platform Security ·
17 Platform Messaging · 28 Telephony · 32 Webhooks · 33 AI Governance ·
34 Credentials · 35 API Governance

---

## Decisions outstanding

| Ref | Question | Blocks |
|---|---|---|
| X1b | Which mobile-money provider initiates a top-up charge? | Wallet top-ups working end to end |
| X2b | Which document types are required, per organisation type? | E3, and screens 19, 25, 31 |
| D2 | Is the email mailbox wanted at all? | Screens 7, 17 |
| D3 | Are the WhatsApp pool and the phone-number pool one inventory or two? | Screens 16, 29, 31 |
| D4 | Who owns plan price, alert config, and each credential? | F5, F7, screens 14/21/24, 15/35, 33/34 |
| D8 | Enterprise plan appears twice with zero prices — genuine duplicates? | Screen 21 |
| D9 | Zero price or negotiated price? | Screen 21 |
| D12 | What happens to a fleet provider that shrinks? | Screen 27 |
| — | Confirm screen 12 is dropped | Screen 12 |

---

## Debt

See `tech-debt.md`.

- **TD-1** One database role for every service. Direction agreed: a narrow view,
  then a role per service.
- **TD-2** Single-currency until international currency is switched on.

## Housekeeping

`ddd-architecture.md` and `auth-api-reference.md` still document the `/auth/*`
route prefix that commit `58c23d3` removed. Both are stale against `main`.
