import { Migration } from '@mikro-orm/migrations';

/**
 * Admin-managed licence plans, price history and billing settings.
 *
 * Settings are seeded with on-conflict-do-nothing so a re-run never writes
 * over a price an admin changed. Installation stays at the 15,000 naira the
 * platform already charges.
 */
export class Migration20261002010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "m2m_license_plans" add column if not exists "validity_days" int not null default 365;`,
    );
    this.addSql(
      `alter table "m2m_license_plans" add column if not exists "components" jsonb null;`,
    );
    this.addSql(
      `alter table "m2m_license_plans" add column if not exists "last_price_changed_at" timestamptz null;`,
    );

    this.addSql(
      `alter table "onboarding_payments" add column if not exists "order_summary" jsonb null;`,
    );

    this.addSql(`create table if not exists "billing_price_changes" (
      "id" varchar(64) not null,
      "item_type" varchar(32) not null,
      "item_ref" varchar(64) not null,
      "field" varchar(32) not null,
      "old_price_ngn" int not null,
      "new_price_ngn" int not null,
      "effective_date" date not null,
      "reason" varchar(500) not null,
      "changed_by_user_id" varchar(64) not null,
      "changed_by_name" varchar(160) not null,
      "created_at" timestamptz not null default now(),
      constraint "billing_price_changes_pkey" primary key ("id")
    );`);
    this.addSql(
      `create index if not exists "billing_price_changes_item_idx" on "billing_price_changes" ("item_type", "item_ref", "created_at" desc);`,
    );

    this.addSql(`create table if not exists "billing_settings" (
      "key" varchar(64) not null,
      "value_json" jsonb not null,
      "updated_at" timestamptz not null default now(),
      "updated_by" varchar(64) null,
      constraint "billing_settings_pkey" primary key ("key")
    );`);
    this.addSql(`insert into "billing_settings" ("key", "value_json") values
      ('installation_fee_enterprise_ngn', '15000'::jsonb),
      ('installation_fee_owner_operator_ngn', '15000'::jsonb),
      ('default_tax_rate_pct', '0'::jsonb),
      ('quote_validity_days', '30'::jsonb),
      ('invoice_due_days', '15'::jsonb)
    on conflict ("key") do nothing;`);
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "onboarding_payments" drop column if exists "order_summary";`,
    );
    this.addSql(`drop table if exists "billing_settings";`);
    this.addSql(`drop table if exists "billing_price_changes";`);
    this.addSql(
      `alter table "m2m_license_plans" drop column if exists "last_price_changed_at";`,
    );
    this.addSql(
      `alter table "m2m_license_plans" drop column if exists "components";`,
    );
    this.addSql(
      `alter table "m2m_license_plans" drop column if exists "validity_days";`,
    );
  }
}
