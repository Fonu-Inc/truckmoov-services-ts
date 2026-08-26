# Tech debt

Known debt with a decided direction, waiting on scheduling. Newest first.

---

## TD-8 — Auto top-up is configured but can never fire

**Status:** open. Blocked on a stored payment authorisation, not on a decision.

### What happens

A tenant switches auto top-up on and sets a threshold. The balance falls past
it, and nothing happens. Sends start failing.

`auto-topup.repository.ts` stores `enabled`, `thresholdKobo`, `topupAmountKobo`
and a payment provider, and there are use cases to read, save and disable those
settings. Nothing reads the threshold to act on it.

### Why it cannot simply be wired up

Charging a tenant without them present needs a stored payment authorisation —
Paystack returns an `authorization_code` on a first successful charge, which can
then be reused. Nothing in the codebase stores one. `create-payment-intent`
starts a fresh checkout every time, which needs the tenant at the keyboard.

So auto top-up cannot be made to work by connecting existing parts. It needs the
authorisation captured and stored first, which is a change to the payment flow
and a decision about holding a payment instrument on file.

### What was built instead

`LowBalanceNotifierService` publishes `wallet.balance.low` and
`wallet.balance.negative` when a debit takes a wallet across its threshold —
raised on the crossing, not on every charge, so the warning stays worth reading.
That is the part that can honestly work today, and the requirements ask for it
regardless.

### When auto top-up is picked up

Store the authorisation on first successful top-up, then have the notifier's
crossing trigger a charge against it rather than only an event. The threshold
and amount are already stored and need no change.

## TD-7 — Approving an organisation upgrade is not one action

**Status:** open. Parked pending an internal decision on whether and how an
organisation should be promoted at all.

### What happens

An owner-operator asks to become a fleet provider. An admin clicks Approve.
Four things are then saved one at a time:

1. The company's type.
2. Each staff account at that company, one save per person.
3. The request, marked approved.
4. An email to the requester.

Nothing ties those saves together. If anything interrupts partway — a restart,
a deploy, a database blip — whatever already saved stays saved and the rest
never runs. The company reads as a fleet provider while some of its staff still
hold the old account type, and the request still sits in the queue as pending,
so an admin sees it as untouched. Nobody is told and nothing retries.

### The comment is wrong

`organisation-upgrade.use-cases.ts` says the type change, the role change and
the decision "are one unit of work". They are not. Anyone reading that file
believes a protection exists that does not. Correct the comment whether or not
the behaviour is changed.

### The order is right, though

A failure leaves staff with less access than the company implies, not more.
Reversing the order so staff are promoted first would leave people holding fleet
admin rights in an organisation not entitled to them. Leave the order alone.

### What the fix costs

Not a wrapper. Each of the three repositories opens its own forked
EntityManager, so they do not share a database session. Making the saves one
unit means changing how all three are called, and other screens call them. Half
a day, touching shared code.

### When it matters

Approvals are rare and the window is a fraction of a second, so the odds are
low. It is worth doing before real operators start using the upgrade queue, and
not before.

## TD-6 — Device catalogue is empty until trackers are bought

**Status:** open. Blocked on hardware, not on a decision.

### What a reader will see

Every call to configure a device on the installation screen fails with
`DeviceModelNotInCatalogError`. The screen looks broken. It is not.

### Why

`system_device_models` has no rows, and nothing seeds it. Protocol and port are
properties of a device model, so `ConfigureDeviceUseCase` reads them from the
catalogue and refuses when the model is absent. It refuses on purpose: a tracker
programmed with a guessed port reports nothing, and the only symptom is a
verification timeout days later with an installer already on site.

No trackers have been bought, so there are no real models to enter.

### What to do when the first order is placed

1. Add the model to the catalogue with the port Traccar actually serves for that
   protocol. Traccar's shipped defaults bind every protocol port inside the pod
   — Teltonika 5027, GT06/Concox 5023, gps103/Coban 5001, tk103 5002, t55 5005,
   OsmAnd 5055 — but `traccar-deployment.yaml` exposes only three of them
   through `hostPort`. Open the one the model needs before entering it.
2. Set the ingest address. One value cannot serve both paths: a hardware tracker
   dials Traccar over TCP, while an app or SDK posts to the tracking service
   over HTTP. `GetInstallerGuideUseCase` currently prints one host for
   everything and needs splitting when a real address exists.
3. Consider refusing a catalogue port that no listener serves, so a wrong port
   is caught at entry rather than by a failed installation.

### Related risk, not owned here

Traccar is exposed by `hostPort` with `strategy: Recreate` over a PVC. Devices
dial whichever node the pod runs on. If that pod moves, every fitted tracker
points at a node with nothing behind it and stops reporting, and re-pointing a
fitted tracker needs an SMS command per unit or a site visit. Harmless while
nothing is fitted. It stops being harmless on the first installation.

## TD-2 — Single-currency until international currency is switched on

**Status:** the gate is built and on. What remains is the rate machinery, which
is only needed when the flag is switched on. Deferred feature rather than debt.

### Decision

The platform shows Naira only. Currency conversion and the USD preview stay off
until international currency is a deliberate piece of work.

### Why it is safe to defer

Storage is already single-currency: `balance_kobo`, `price_kobo`, and
`monthly_price_ngn` all hold Naira, and nothing converts at write time. Turning
conversion off removes a display path. It does not change a stored figure.

The requirements document warns about the alternative. Screen 20, line 4518: if
a second currency is ever added, every stored amount needs an explicit currency
alongside it, not an implied one. Keeping the feature off makes that an explicit
decision later rather than a half-built state now.

### Built

- `features.internationalCurrency`, default false, normalised to false on any
  row written before it existed.
- `defaults.platformCurrency`, default `NGN`. Any other value is refused with
  `UnsupportedPlatformCurrencyError` rather than stored, because changing the
  setting converts nothing: a stored `USD` would relabel every Naira figure on
  the platform.
- `GET /auth/onboarding/exchange-rate` reports the currency and `ngnPerUsd:
  null`. It no longer fetches a live rate from a third party, and no longer
  falls back to a hardcoded 1600 served as `status: true` — a figure nobody set,
  cached per process, so two replicas could quote different prices for the same
  plan.
- `EXCHANGE_RATE_API_KEY` removed from config. The requirements have the rate
  entered by an admin through an explicit "Update Rate" action, not pulled from
  an API, so the key had no future use.
- Tenant organisation settings defaulted to `currency: 'USD'`. Now `NGN`.

### Still to build, when the flag is switched on

An append-only, effective-dated rate table with the setter recorded — the same
shape as the communication rates. The requirements are explicit that rate
changes are versioned with an effective timestamp "so a quote given yesterday
can be explained today", and that a rate is never applied to a stored amount or
historical figures drift every time it moves. A stale-rate alert past a
threshold is wanted too; the screen showing an age relies on someone noticing.

### Agreed shape

A flag beside the ones that already exist in `system_settings.features`
(`allowNewTenantRegistration`, `maintenanceMode`, `enableBetaFeatures`):

```
features.internationalCurrency = false
```

No migration: `features` is a JSON column, and the existing system-admin
`PATCH /system/settings` already edits it.

While the flag is off:

1. Every amount renders in Naira.
2. No endpoint returns a converted figure. The gate applies at the API, not only
   in the interface — a hidden panel served by a live conversion endpoint is how
   stale dollar prices return.
3. The exchange rate may be stored, but is never applied. It is never applied to
   a stored amount even when the flag is on.
4. Screen 20 reduces to the default-currency setting. Screen 21 drops its USD
   preview.

### Known follow-on

Screen 33 prices AI usage in Naira against provider costs in USD, so its margin
figure needs a rate eventually. That screen depends on this flag being turned on,
and should not ship a private conversion of its own in the meantime.

## TD-1 — One database role for every service

**Status:** open. Direction agreed, not scheduled.

### What

Every service authenticates to Postgres as the same role. Confirmed in
`truckmoov-gitops/manifests/*/configmap.yaml`:

| Service | `POSTGRES_DB` | `POSTGRES_USER` |
|---|---|---|
| auth | `truckmoov` | `truckmoov` |
| fleet | `truckmoov` | `truckmoov` |
| dispatch | `truckmoov` | `truckmoov` |
| notification | `truckmoov` | `truckmoov` |
| console-service | `truckmoov` | `truckmoov` |

That role owns the schema, so the capability is not read-only. Any single
service compromise — a leaked pod environment, an SSRF that reaches the
database, a dependency with a payload — yields read, write and `drop` across
every table in the platform: `auth_users`, sessions, `tenant_kyc_documents`
(which hold director identity documents), `tenant_wallets`, invoices, telemetry.

Row-level security does not cover this. The RLS already in place
(`console-service/src/migrations/Migration20260818000000.ts`) segments
*tenants*. This is a different axis — *services*. A single owning role passes
straight through it.

The database is managed by a cloud provider, but the grant model inside the
database is ours. Managed hosting protects the host and the network. It does
not decide what the `truckmoov` role may select.

### Why it is now load-bearing

`MikroVehicleQuotaReader`
(`apps/fleet/src/contexts/fleet/vehicles/infrastructure/repositories/mikro-vehicle-quota-reader.ts`)
reads `system_tenant_onboardings` and `system_subscription_plans`, which belong
to auth, to enforce the plan vehicle cap.

Before that, cross-service access was incidental: nothing depended on it, so it
could have been revoked with nothing breaking. It is now a real dependency.
Revoking ambient access breaks vehicle creation until an explicit grant exists.

### Agreed direction

**Step 1 — a narrow view for the one crossing that exists.**
Create a view exposing only what fleet needs:

```sql
create view tenant_vehicle_quota_v as
  select o.tenant_id, p.max_active_vehicles
    from system_tenant_onboardings o
    join system_subscription_plans p on p.code = o.subscription->>'planCode';
```

Point `MikroVehicleQuotaReader` at it. Fleet then sees two columns instead of
the plan catalogue and every onboarding row. One object to replace if the
databases are ever split.

**Step 2 — a role per service, with explicit grants.**
Same database, no network change, and it can proceed one service at a time.
`fleet_svc` reaches `fleet_*`, `auth_svc` reaches `auth_*` and `system_*`, and
neither owns the other's tables. The quota crossing becomes one reviewable line
rather than an ambient capability:

```sql
grant select on tenant_vehicle_quota_v to fleet_svc;
```

Expect step 2 to break anything that silently relied on shared access. That is
the point: it converts unknown coupling into a failing deploy that names itself.

### Rejected for now

**Separate schemas or databases per service.** The correct boundary, and the
expensive one: every current cross-service join becomes an HTTP call, and each
inherits latency and a new failure mode. Revisit if step 2 uncovers many
crossings.

**An HTTP port for the quota read.** Considered and set aside. It buys a clean
boundary and costs latency on vehicle creation plus a fail-open or fail-closed
decision. The same-database read has no new failure mode, since a failure there
means the database is unreachable and the vehicle write fails regardless.

---

## TD-3 — A tenant who downgrades is instantly over their storage quota

**Status:** deferred by decision, 25 August 2026. Recorded so it is not
rediscovered as a bug.

Storage quota enforcement refuses new uploads and leaves stored data alone. A
tenant moving from a 50 GB plan to a 10 GB one therefore keeps 50 GB and cannot
upload anything until they delete 40 GB.

That is deliberate. Deleting a tenant's files because they changed plan is worse
than the alternative, and the alternative is at least visible to them.

What it needs before it is settled:

- A grace period, or a read-only state, rather than a hard stop on the next
  upload.
- Something that tells the tenant they are over, since today they only find out
  when an upload is refused.
- A policy for a tenant who stays over indefinitely.

`StorageQuotaService.assertRoomFor` is the one place this behaviour lives.

---

## TD-4 — Payment model is not enforced when a tenant changes plan

Plan entitlements carry a payment model, prepaid or postpaid, and the
requirements document is explicit that prepaid and postpaid are separate plan
sets: a tenant switching model is changing plan, not flipping a billing flag.

Nothing enforces that today. A tenant can move between a prepaid and a postpaid
plan and the wallet behaviour does not change with them.

---

## TD-5 — Admin editing of plan entitlements is not built

**Status:** deferred by decision, 25 August 2026.

Screen 24 is an editing screen: a "New Plan" button, and a form for quotas,
features, availability and trial length. The store, the inheritance resolver and
the seed exist, and every quota check reads them, but there is no endpoint a
platform administrator can use to change any of it.

Entitlements can currently be altered only by editing `plan-entitlement-seeds.ts`
and redeploying. The seed deliberately fills absences only, so an operator edit
would survive once the endpoints exist.

