import { Migration } from '@mikro-orm/migrations';

export class Migration20260618000000 extends Migration {
  override async up(): Promise<void> {
    // ── iot_sims new columns ──────────────────────────────────────────────
    this.addSql(`alter table "iot_sims" add column if not exists "device_name" varchar(255) null;`);
    this.addSql(`alter table "iot_sims" add column if not exists "device_imei" varchar(64) null;`);
    this.addSql(`alter table "iot_sims" add column if not exists "device_type" varchar(64) null;`);
    this.addSql(`alter table "iot_sims" add column if not exists "vehicle_id" varchar(64) null;`);
    this.addSql(`alter table "iot_sims" add column if not exists "suspension_reason" varchar(255) null;`);
    this.addSql(`alter table "iot_sims" add column if not exists "notes" text null;`);

    // ── bundle_carriers ───────────────────────────────────────────────────
    this.addSql(`
      create table if not exists "bundle_carriers" (
        "id" varchar(64) not null,
        "name" varchar(128) not null,
        "display_name" varchar(128) not null,
        "active" boolean not null default true,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "bundle_carriers_pkey" primary key ("id")
      );
    `);

    // ── bundle_catalog ────────────────────────────────────────────────────
    this.addSql(`
      create table if not exists "bundle_catalog" (
        "id" varchar(255) not null,
        "code" varchar(128) not null,
        "name" varchar(255) not null,
        "carrier_id" varchar(64) not null,
        "data_amount_gb" numeric(8,2) not null default 0,
        "validity_days" int not null default 30,
        "billing_cycle" varchar(16) not null default 'monthly',
        "price_kobo" bigint not null default 0,
        "currency" varchar(8) not null default 'NGN',
        "active" boolean not null default true,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "bundle_catalog_pkey" primary key ("id"),
        constraint "bundle_catalog_code_unique" unique ("code")
      );
    `);
    this.addSql(`create index if not exists "bundle_catalog_carrier_id_idx" on "bundle_catalog" ("carrier_id");`);

    // ── tenant_wallets ────────────────────────────────────────────────────
    this.addSql(`
      create table if not exists "tenant_wallets" (
        "tenant_id" varchar(64) not null,
        "balance_kobo" bigint not null default 0,
        "currency" varchar(8) not null default 'NGN',
        "updated_at" timestamptz not null default now(),
        constraint "tenant_wallets_pkey" primary key ("tenant_id")
      );
    `);

    // ── wallet_top_ups ────────────────────────────────────────────────────
    this.addSql(`
      create table if not exists "wallet_top_ups" (
        "id" uuid not null default gen_random_uuid(),
        "tenant_id" varchar(64) not null,
        "amount_kobo" bigint not null,
        "provider" varchar(64) not null,
        "mobile_number" varchar(32) not null,
        "status" varchar(32) not null default 'pending',
        "reference" varchar(255) null,
        "created_at" timestamptz not null default now(),
        constraint "wallet_top_ups_pkey" primary key ("id")
      );
    `);
    this.addSql(`create index if not exists "wallet_top_ups_tenant_id_idx" on "wallet_top_ups" ("tenant_id");`);

    // ── spending_limit_settings ───────────────────────────────────────────
    this.addSql(`
      create table if not exists "spending_limit_settings" (
        "tenant_id" varchar(64) not null,
        "enabled" boolean not null default false,
        "monthly_limit_kobo" bigint not null default 0,
        "spent_this_month_kobo" bigint not null default 0,
        "reset_day_of_month" int not null default 1,
        "alert_email" varchar(255) null,
        "notify_at_percentages" jsonb not null default '[80, 100]',
        "updated_at" timestamptz not null default now(),
        constraint "spending_limit_settings_pkey" primary key ("tenant_id")
      );
    `);

    // ── auto_topup_settings ───────────────────────────────────────────────
    this.addSql(`
      create table if not exists "auto_topup_settings" (
        "tenant_id" varchar(64) not null,
        "enabled" boolean not null default false,
        "threshold_kobo" bigint not null default 0,
        "topup_amount_kobo" bigint not null default 0,
        "payment_provider" varchar(64) not null default 'MTN_MOMO',
        "mobile_number" varchar(32) null,
        "updated_at" timestamptz not null default now(),
        constraint "auto_topup_settings_pkey" primary key ("tenant_id")
      );
    `);

    // ── bundle_allocations ────────────────────────────────────────────────
    this.addSql(`
      create table if not exists "bundle_allocations" (
        "id" uuid not null default gen_random_uuid(),
        "tenant_id" varchar(64) not null,
        "mobile_number" varchar(32) not null,
        "bundle_id" varchar(255) not null,
        "data_used_mb" numeric(12,2) not null default 0,
        "data_total_mb" numeric(12,2) not null default 0,
        "activated_at" timestamptz null,
        "expires_at" timestamptz null,
        "status" varchar(32) not null default 'pending',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "bundle_allocations_pkey" primary key ("id")
      );
    `);
    this.addSql(`create index if not exists "bundle_allocations_tenant_id_idx" on "bundle_allocations" ("tenant_id");`);
    this.addSql(`create index if not exists "bundle_allocations_expires_at_idx" on "bundle_allocations" ("expires_at");`);

    // ── bundle_transactions ───────────────────────────────────────────────
    this.addSql(`
      create table if not exists "bundle_transactions" (
        "id" uuid not null default gen_random_uuid(),
        "tenant_id" varchar(64) not null,
        "mobile_number" varchar(32) not null,
        "bundle_id" varchar(255) not null,
        "amount_kobo" bigint not null,
        "status" varchar(32) not null default 'pending',
        "payment_reference" varchar(255) null,
        "failure_reason" text null,
        "created_at" timestamptz not null default now(),
        constraint "bundle_transactions_pkey" primary key ("id")
      );
    `);
    this.addSql(`create index if not exists "bundle_transactions_tenant_id_idx" on "bundle_transactions" ("tenant_id");`);
    this.addSql(`create index if not exists "bundle_transactions_created_at_idx" on "bundle_transactions" ("created_at");`);

    // ── device_mapping_files ──────────────────────────────────────────────
    this.addSql(`
      create table if not exists "device_mapping_files" (
        "id" uuid not null default gen_random_uuid(),
        "tenant_id" varchar(64) not null,
        "file_key" varchar(512) not null,
        "row_count" int not null default 0,
        "errors" jsonb null,
        "created_at" timestamptz not null default now(),
        constraint "device_mapping_files_pkey" primary key ("id")
      );
    `);
    this.addSql(`create index if not exists "device_mapping_files_tenant_id_idx" on "device_mapping_files" ("tenant_id");`);
  }
}
