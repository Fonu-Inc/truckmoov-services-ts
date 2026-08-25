import { Migration } from "@mikro-orm/migrations";

/**
 * What each plan gives a tenant, and how much of a monthly allowance is left.
 *
 * The plan row already carried a price and two quotas. Entitlements are wider
 * than that — six resources, features with their own limits, usage allowances,
 * and which organisation types may subscribe — so they live in their own table
 * keyed by plan code rather than widening the plan row further.
 */
export class Migration20260825010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "plan_entitlements" (
        "plan_code" varchar(80) not null primary key,
        "payment_model" varchar(16) not null default 'prepaid',
        "inherits_from_code" varchar(80) null,
        "quotas" jsonb not null default '{}'::jsonb,
        "limit_behaviour" jsonb not null default '{}'::jsonb,
        "features" jsonb not null default '[]'::jsonb,
        "allowances" jsonb not null default '[]'::jsonb,
        "available_for" jsonb not null default '[]'::jsonb,
        "trial_days" int not null default 0,
        "updated_at" timestamptz not null default now(),
        "updated_by" varchar(128) null
      );
    `);

    /**
     * How much of this month's allowance a tenant has used.
     *
     * The allowance is consumed before the wallet is touched, so this counter
     * is what decides whether a message is free or charged. Keyed by billing
     * month so a new month starts fresh without anything having to reset it.
     */
    this.addSql(`
      create table if not exists "tenant_usage_allowance" (
        "tenant_id" varchar(64) not null,
        "item" varchar(32) not null,
        "billing_month" varchar(7) not null,
        "used" bigint not null default 0,
        "updated_at" timestamptz not null default now(),
        constraint "tenant_usage_allowance_pkey" primary key ("tenant_id", "item", "billing_month")
      );
    `);
    this.addSql(
      `create index if not exists "tenant_usage_allowance_month_idx" on "tenant_usage_allowance" ("billing_month");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_usage_allowance";`);
    this.addSql(`drop table if exists "plan_entitlements";`);
  }
}
