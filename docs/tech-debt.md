# Tech debt

Known debt with a decided direction, waiting on scheduling. Newest first.

---

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
