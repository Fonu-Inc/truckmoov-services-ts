import { Migration } from '@mikro-orm/migrations';

export class Migration20261004020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "enforcement_settings" (
      "id" varchar(16) not null,
      "grace_days" int not null default 3,
      "auto_suspend_enabled" boolean not null default false,
      "auto_suspend_cap_per_run" int not null default 10,
      "paused" boolean not null default false,
      "updated_at" timestamptz null,
      "updated_by" varchar(64) null,
      constraint "enforcement_settings_pkey" primary key ("id"),
      constraint "enforcement_settings_grace_days_chk" check ("grace_days" between 0 and 30),
      constraint "enforcement_settings_cap_chk" check ("auto_suspend_cap_per_run" between 1 and 200)
    );`);
    this.addSql(`insert into "enforcement_settings" ("id") values ('system') on conflict do nothing;`);

    this.addSql(`create table if not exists "billing_arrears" (
      "id" uuid not null default gen_random_uuid(),
      "tenant_id" varchar(64) not null,
      "source" varchar(32) not null,
      "reference" varchar(160) not null,
      "due_date" date not null,
      "amount_kobo" bigint not null,
      "created_at" timestamptz not null default now(),
      "resolved_at" timestamptz null,
      "resolution" varchar(32) null,
      constraint "billing_arrears_pkey" primary key ("id"),
      constraint "billing_arrears_reference_key" unique ("reference")
    );`);
    this.addSql(
      `create index if not exists "billing_arrears_open_tenant_idx" on "billing_arrears" ("tenant_id") where "resolved_at" is null;`,
    );

    this.addSql(`create table if not exists "enforcement_notices" (
      "id" uuid not null default gen_random_uuid(),
      "tenant_id" varchar(64) not null,
      "kind" varchar(16) not null,
      "dedup_key" varchar(160) not null,
      "unpaid_since" date null,
      "recipients" jsonb not null default '[]',
      "status" varchar(8) not null default 'pending',
      "attempts" int not null default 0,
      "last_error" text null,
      "created_at" timestamptz not null default now(),
      "sent_at" timestamptz null,
      "grace_days_at_send" smallint null,
      constraint "enforcement_notices_pkey" primary key ("id"),
      constraint "enforcement_notices_dedup_key_key" unique ("dedup_key")
    );`);
    this.addSql(
      `alter table "enforcement_notices" add column if not exists "grace_days_at_send" smallint null;`,
    );
    this.addSql(
      `create index if not exists "enforcement_notices_tenant_idx" on "enforcement_notices" ("tenant_id", "created_at" desc);`,
    );

    this.addSql(`create table if not exists "enforcement_runs" (
      "id" uuid not null default gen_random_uuid(),
      "kind" varchar(16) not null,
      "run_date" date not null,
      "started_at" timestamptz not null default now(),
      "finished_at" timestamptz null,
      "notified" int not null default 0,
      "suspended" int not null default 0,
      "restored" int not null default 0,
      "capped" int not null default 0,
      "skipped_reason" text null,
      "error" text null,
      constraint "enforcement_runs_pkey" primary key ("id"),
      constraint "enforcement_runs_kind_date_key" unique ("kind", "run_date")
    );`);

    this.addSql(`create table if not exists "enforcement_waivers" (
      "tenant_id" varchar(64) not null,
      "unpaid_since" date not null,
      "created_by" varchar(64) not null,
      "created_at" timestamptz not null default now(),
      "reason" text null,
      constraint "enforcement_waivers_pkey" primary key ("tenant_id", "unpaid_since")
    );`);

    this.addSql(
      `create index if not exists "billing_invoices_tenant_idx" on "billing_invoices" ("tenant_id");`,
    );
    this.addSql(`create index if not exists "billing_invoices_open_due_idx" on "billing_invoices" ("due_date")
      where "status" in ('issued', 'partially_paid', 'overdue');`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "billing_invoices_open_due_idx";`);
    this.addSql(`drop index if exists "billing_invoices_tenant_idx";`);
    this.addSql(`drop table if exists "enforcement_waivers";`);
    this.addSql(`drop table if exists "enforcement_runs";`);
    this.addSql(`drop table if exists "enforcement_notices";`);
    this.addSql(`drop table if exists "billing_arrears";`);
    this.addSql(`drop table if exists "enforcement_settings";`);
  }
}
