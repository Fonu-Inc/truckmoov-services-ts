# Tech debt

Known debt with a decided direction, waiting on scheduling. Newest first.

---

## TD-2 — Single-currency until international currency is switched on

**Status:** open. Direction agreed, not scheduled. Deferred feature rather than debt.

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

## TD-4 — Storage subtotals drift and nothing reconciles them yet

`tenant_storage_usage` holds a running byte total per tenant per source, moved
by a signed delta on upload and delete. The design allows each service to
recompute its own source from its own tables — `setBytes` exists for exactly
that — but no reconciliation job calls it.

Until one does, a missed delete leaves the total permanently high, and a tenant
eventually gets refused with room to spare.

Each service can fix its own row without reading another service's data:

- fleet recomputes `fleet_documents` by summing `size_bytes` per tenant.
- auth recomputes `kyc`, `media` and `mailbox` the same way.

A sweep per service, running daily, is enough. The counter stays the fast path;
reconciliation is what makes it eventually correct.

---

## TD-5 — Payment model is not enforced when a tenant changes plan

Plan entitlements carry a payment model, prepaid or postpaid, and the
requirements document is explicit that prepaid and postpaid are separate plan
sets: a tenant switching model is changing plan, not flipping a billing flag.

Nothing enforces that today. A tenant can move between a prepaid and a postpaid
plan and the wallet behaviour does not change with them.

---

## TD-6 — Admin editing of plan entitlements is not built

**Status:** deferred by decision, 25 August 2026.

Screen 24 is an editing screen: a "New Plan" button, and a form for quotas,
features, availability and trial length. The store, the inheritance resolver and
the seed exist, and every quota check reads them, but there is no endpoint a
platform administrator can use to change any of it.

Entitlements can currently be altered only by editing `plan-entitlement-seeds.ts`
and redeploying. The seed deliberately fills absences only, so an operator edit
would survive once the endpoints exist.

