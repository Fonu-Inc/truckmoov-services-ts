import { Migration } from '@mikro-orm/migrations';

export class Migration20261005010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "enforcement_settings" add column if not exists "renewal_lead_days" smallint not null default 7;`,
    );
    this.addSql(
      `alter table "enforcement_settings" drop constraint if exists "enforcement_settings_renewal_lead_chk";`,
    );
    this.addSql(
      `alter table "enforcement_settings" add constraint "enforcement_settings_renewal_lead_chk" check ("renewal_lead_days" between 1 and 60);`,
    );

    this.addSql(`create table if not exists "tenant_licence_periods" (
      "id" uuid not null default gen_random_uuid(),
      "tenant_id" varchar(64) not null,
      "application_id" varchar(64) not null,
      "plan_code" varchar(64) not null,
      "device_count" int not null,
      "period_start" date not null,
      "period_end" date not null,
      "status" varchar(12) not null default 'active',
      "renewal_invoice_id" varchar(64) null references "billing_invoices" ("id") on delete set null,
      "origin" varchar(12) not null default 'purchase',
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "tenant_licence_periods_pkey" primary key ("id"),
      constraint "tenant_licence_periods_status_chk" check ("status" in ('active', 'renewed', 'ended')),
      constraint "tenant_licence_periods_origin_chk" check ("origin" in ('purchase', 'backfill', 'renewal'))
    );`);
    this.addSql(
      `create unique index if not exists "tenant_licence_periods_tenant_end_key" on "tenant_licence_periods" ("tenant_id", "period_end");`,
    );
    this.addSql(
      `create unique index if not exists "tenant_licence_periods_one_active_key" on "tenant_licence_periods" ("tenant_id") where "status" = 'active';`,
    );
    this.addSql(
      `create index if not exists "tenant_licence_periods_due_idx" on "tenant_licence_periods" ("period_end") where "status" = 'active' and "renewal_invoice_id" is null;`,
    );
    this.addSql(
      `create index if not exists "tenant_licence_periods_invoice_idx" on "tenant_licence_periods" ("renewal_invoice_id") where "renewal_invoice_id" is not null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_licence_periods";`);
    this.addSql(
      `alter table "enforcement_settings" drop constraint if exists "enforcement_settings_renewal_lead_chk";`,
    );
    this.addSql(`alter table "enforcement_settings" drop column if exists "renewal_lead_days";`);
  }
}
