# Index build runbook

Why: the migration framework runs each migration in a transaction, so the
migrations can only use plain `CREATE INDEX IF NOT EXISTS`, which write-locks the
table while it builds. On a large table, build the indexes first with
`CREATE INDEX CONCURRENTLY`, outside any transaction, then deploy. The
migrations then find the index already there and do nothing.

Applies to `Migration20261007100000` in auth and in fleet, and to
`onboarding_payments_tenant_id_idx` from auth `Migration20261008010000`.

## Rules

- Run each statement on its own, in `psql` with autocommit (no `BEGIN`). A
  `CONCURRENTLY` build cannot run inside a transaction block.
- Names must match the migration exactly, or the migration builds a second copy.
- Build time depends on table size. Writes keep working; the build waits for
  open transactions that started before it.
- If a build fails or is cancelled it leaves an INVALID index. Check with the
  query below, drop it with `DROP INDEX CONCURRENTLY`, then run the statement
  again.

```sql
select c.relname from pg_index i join pg_class c on c.oid = i.indexrelid
 where not i.indisvalid;
```

## Order

Auth and fleet share one database (`POSTGRES_DB` in `deploy/k8s`). Run the auth
statements first, then the fleet ones. Inside auth, biggest tables first so the
long builds start early: `auth_sessions`, `auth_users`, `onboarding_payments`,
`wallet_top_ups`, `billing_quotations`, `onboarding_applications`.

Finish all of it before deploying the release that carries the migrations.

## Auth database

The `tenant_id` column on `onboarding_payments` is added and backfilled by
`Migration20261008010000`, which holds an exclusive lock on that table until it
commits. Add the column by hand first, so the index below is built before the
release and the migration only runs the backfill:

```sql
ALTER TABLE onboarding_payments ADD COLUMN IF NOT EXISTS tenant_id varchar(64) NULL;
```

Then:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS auth_sessions_tenant_id_idx ON auth_sessions (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS auth_users_tenant_id_idx ON auth_users (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS onboarding_payments_paid_at_idx ON onboarding_payments (paid_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS onboarding_payments_tenant_id_idx ON onboarding_payments (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS wallet_top_ups_settled_at_idx ON wallet_top_ups (settled_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS billing_quotations_tenant_id_idx ON billing_quotations (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS onboarding_applications_tenant_id_idx ON onboarding_applications (tenant_id);
```

## Fleet database

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS fleet_compliance_documents_vehicle_idx ON fleet_compliance_documents (tenant_id, vehicle_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS fleet_alerts_tenant_vehicle_idx ON fleet_alerts (tenant_id, vehicle_id);
```

The same migration also creates `fleet_fuel_thresholds` and its unique index.
That table is new and empty, so it needs no out-of-band build.

## Check

```sql
select schemaname, tablename, indexname from pg_indexes
 where indexname in (
   'auth_sessions_user_id_idx', 'auth_sessions_tenant_id_idx', 'auth_users_tenant_id_idx',
   'onboarding_payments_paid_at_idx', 'onboarding_payments_tenant_id_idx',
   'wallet_top_ups_settled_at_idx', 'billing_quotations_tenant_id_idx',
   'onboarding_applications_tenant_id_idx',
   'fleet_compliance_documents_vehicle_idx', 'fleet_alerts_tenant_vehicle_idx'
 ) order by indexname;
```

It should list 10 rows (8 auth, 2 fleet). Then deploy.

## Still open

Only the indexes above exist. The DB audit high-priority index plan has not been
diffed against them yet; every index it lists that is missing here still needs a
migration and an entry in this runbook.
