import { Migration } from "@mikro-orm/migrations";

/**
 * Pricing rules, invoice settings, customer invoices, and the number sequence
 * behind them.
 *
 * The sequence lives here rather than in auth because a number has to be taken
 * and the invoice written in one transaction. Calling another service to
 * allocate it puts a network hop between the two, and a failure in that gap
 * burns a number — which is exactly the gap the requirements forbid. Auth keeps
 * its own two platform series; these are the tenant's own invoices to its
 * customers, a separate lifecycle.
 */
export class Migration20260826020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "fleet_pricing_rules" (
        "id" varchar(255) not null primary key,
        "tenant_id" varchar(64) not null,
        "name" varchar(255) not null,
        "origin" varchar(255) null,
        "destination" varchar(255) not null,
        "destination_aliases" jsonb not null default '[]',
        "mode" varchar(16) not null,
        "currency" varchar(8) not null default 'NGN',
        "flat_price_kobo" bigint null,
        "price_per_unit_kobo" bigint null,
        "unit_type" varchar(32) null,
        "minimum_charge_kobo" bigint null,
        "vehicle_type" varchar(64) null,
        "customer_name" varchar(255) null,
        "effective_from" date null,
        "effective_to" date null,
        "active" boolean not null default true,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      )
    `);
    this.addSql(`
      create index if not exists "fleet_pricing_rules_tenant_active_index"
        on "fleet_pricing_rules" ("tenant_id", "active")
    `);

    this.addSql(`
      create table if not exists "fleet_invoice_settings" (
        "tenant_id" varchar(64) not null primary key,
        "company_name" varchar(255) not null,
        "address" text null,
        "phone" varchar(32) null,
        "email" varchar(255) null,
        "tax_enabled" boolean not null default false,
        "tax_rate_basis_points" int not null default 0,
        "bank_name" varchar(255) null,
        "account_name" varchar(255) null,
        "account_number" varchar(32) null,
        "invoice_prefix" varchar(16) not null default 'INV',
        "payment_terms_days" int not null default 30,
        "default_notes" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      )
    `);

    this.addSql(`
      create table if not exists "fleet_customer_invoices" (
        "id" varchar(255) not null primary key,
        "tenant_id" varchar(64) not null,
        "invoice_number" varchar(64) not null,
        "status" varchar(16) not null default 'draft',
        "customer_name" varchar(255) not null,
        "origin" varchar(255) null,
        "destination" varchar(255) null,
        "vehicle_registration" varchar(64) null,
        "subtotal_kobo" bigint not null,
        "tax_kobo" bigint not null default 0,
        "total_kobo" bigint not null,
        "currency" varchar(8) not null default 'NGN',
        "issued_at" timestamptz null,
        "due_at" date null,
        "sent_to" varchar(255) null,
        "sent_at" timestamptz null,
        "paid_at" timestamptz null,
        "payment_reference" varchar(128) null,
        "settings_snapshot" jsonb not null default '{}',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      )
    `);
    // Unique per tenant, not globally: two tenants may both issue INV-2026-0001.
    this.addSql(`
      create unique index if not exists "fleet_customer_invoices_tenant_number_unique"
        on "fleet_customer_invoices" ("tenant_id", "invoice_number")
    `);
    this.addSql(`
      create index if not exists "fleet_customer_invoices_tenant_status_index"
        on "fleet_customer_invoices" ("tenant_id", "status")
    `);

    this.addSql(`
      create table if not exists "fleet_invoice_number_sequences" (
        "tenant_id" varchar(64) not null,
        "series" varchar(16) not null,
        "year" int not null,
        "next_value" int not null default 1,
        constraint "fleet_invoice_number_sequences_pkey"
          primary key ("tenant_id", "series", "year")
      )
    `);

    // Where an invoice sends back to, captured when the waybill arrived. A
    // waybill that came over WhatsApp replies to that number; one uploaded by a
    // person replies to them.
    this.addSql(`
      alter table "fleet_waybills"
        add column if not exists "reply_channel" varchar(16) null,
        add column if not exists "reply_address" varchar(255) null
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_invoice_number_sequences"`);
    this.addSql(`drop table if exists "fleet_customer_invoices"`);
    this.addSql(`drop table if exists "fleet_invoice_settings"`);
    this.addSql(`drop table if exists "fleet_pricing_rules"`);
    this.addSql(`
      alter table "fleet_waybills"
        drop column if exists "reply_channel",
        drop column if exists "reply_address"
    `);
  }
}
