import { Migration } from "@mikro-orm/migrations";

/**
 * Waybills — the revenue side of the product.
 *
 * A waybill is captured first and understood later: extraction is a queued job,
 * so a row appears immediately as pending and changes when the job finishes.
 *
 * Money is kobo, matching every other amount on the platform. The reference
 * build used whole naira; mixing the two would mean migrating every row that
 * carries a price once the difference was noticed.
 */
export class Migration20260826010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "fleet_waybills" (
        "id" varchar(255) not null primary key,
        "tenant_id" varchar(64) not null,
        "source" varchar(16) not null,
        "status" varchar(16) not null default 'pending',
        "waybill_number" varchar(64) null,
        "origin" varchar(255) null,
        "destination" varchar(255) null,
        "vehicle_registration" varchar(64) null,
        "customer_name" varchar(255) null,
        "price_kobo" bigint null,
        "pricing_rule_id" varchar(64) null,
        "weight" numeric(14, 3) null,
        "weight_unit" varchar(32) null,
        "waybill_date" date null,
        "image_key" varchar(512) null,
        "image_sha256" varchar(64) null,
        "image_bytes" bigint null,
        "extracted_fields" jsonb not null default '{}',
        "extraction_error" text null,
        "invoice_id" varchar(64) null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      )
    `);

    // Unique per tenant, not globally: two tenants may both number a waybill
    // WB-2025-001. Partial, because the number is unknown until extraction
    // finishes and several rows sit at null in the meantime.
    this.addSql(`
      create unique index if not exists "fleet_waybills_tenant_number_unique"
        on "fleet_waybills" ("tenant_id", "waybill_number")
        where "waybill_number" is not null
    `);
    this.addSql(`
      create index if not exists "fleet_waybills_tenant_status_index"
        on "fleet_waybills" ("tenant_id", "status")
    `);
    this.addSql(`
      create index if not exists "fleet_waybills_tenant_date_index"
        on "fleet_waybills" ("tenant_id", "waybill_date")
    `);
    this.addSql(`
      create index if not exists "fleet_waybills_invoice_index"
        on "fleet_waybills" ("invoice_id")
        where "invoice_id" is not null
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_waybills"`);
  }
}
