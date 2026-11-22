import { Migration } from '@mikro-orm/migrations';

export class Migration20261123160000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "telecom_master_events" add column if not exists "from_status" varchar(32) null;`);
    this.addSql(`alter table "telecom_master_events" add column if not exists "to_status" varchar(32) null;`);
    this.addSql(`alter table "telecom_master_events" add column if not exists "actor_id" varchar(255) null;`);
    // One live request per tenant, and a live number belongs to one account.
    this.addSql(`
      create unique index if not exists "telecom_master_requests_live_tenant_uq"
      on "telecom_master_requests" ("tenant_id")
      where "tenant_id" is not null and "status" not in ('verification_failed', 'allocation_failed');
    `);
    this.addSql(`
      create unique index if not exists "telecom_master_requests_live_msisdn_uq"
      on "telecom_master_requests" ("msisdn")
      where "msisdn" is not null and "status" not in ('verification_failed', 'allocation_failed');
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "telecom_master_requests_live_msisdn_uq";`);
    this.addSql(`drop index if exists "telecom_master_requests_live_tenant_uq";`);
    this.addSql(`alter table "telecom_master_events" drop column if exists "actor_id";`);
    this.addSql(`alter table "telecom_master_events" drop column if exists "to_status";`);
    this.addSql(`alter table "telecom_master_events" drop column if exists "from_status";`);
  }
}
