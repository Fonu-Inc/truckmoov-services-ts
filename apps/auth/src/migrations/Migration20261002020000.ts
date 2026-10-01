import { Migration } from '@mikro-orm/migrations';

/**
 * Quotation snapshots the system records when an applicant starts paying.
 *
 * At most one live quotation exists per application, plan, device count and
 * total, which is what makes a second click reuse the first.
 */
export class Migration20261002020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "billing_quotations" (
      "id" varchar(64) not null,
      "number" varchar(32) not null,
      "prefix" varchar(12) not null,
      "year" int not null,
      "sequence" int not null,
      "application_id" varchar(64) null,
      "tenant_id" varchar(64) null,
      "plan_code" varchar(64) not null,
      "device_count" int not null,
      "customer_name" varchar(200) not null,
      "customer_type" varchar(32) not null,
      "billing_email" varchar(254) not null,
      "status" varchar(20) not null,
      "subtotal_kobo" bigint not null,
      "discount_kobo" bigint not null default 0,
      "tax_rate_bp" int not null default 0,
      "tax_kobo" bigint not null default 0,
      "total_kobo" bigint not null,
      "valid_until" timestamptz not null,
      "sent_at" timestamptz null,
      "accepted_at" timestamptz null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "billing_quotations_pkey" primary key ("id"),
      constraint "billing_quotations_number_key" unique ("number")
    );`);
    this.addSql(
      `create unique index if not exists "billing_quotations_live_key" on "billing_quotations" ("application_id", "plan_code", "device_count", "total_kobo") where "status" <> 'cancelled';`,
    );
    this.addSql(
      `create index if not exists "billing_quotations_application_idx" on "billing_quotations" ("application_id");`,
    );
    this.addSql(
      `create index if not exists "billing_quotations_created_idx" on "billing_quotations" ("created_at" desc, "id" desc);`,
    );
    this.addSql(
      `create index if not exists "billing_quotations_status_idx" on "billing_quotations" ("status");`,
    );

    this.addSql(`create table if not exists "billing_quotation_lines" (
      "id" varchar(64) not null,
      "quotation_id" varchar(64) not null,
      "position" int not null default 0,
      "kind" varchar(20) not null,
      "plan_code" varchar(64) null,
      "name" varchar(200) not null,
      "description" text null,
      "quantity" int not null,
      "unit_price_kobo" bigint not null,
      "validity_days" int null,
      "components" jsonb null,
      "is_renewal" boolean not null default false,
      constraint "billing_quotation_lines_pkey" primary key ("id"),
      constraint "billing_quotation_lines_quotation_fk" foreign key ("quotation_id") references "billing_quotations" ("id") on delete cascade
    );`);
    this.addSql(
      `create index if not exists "billing_quotation_lines_quotation_idx" on "billing_quotation_lines" ("quotation_id");`,
    );

    this.addSql(
      `alter table "onboarding_payments" add column if not exists "quotation_id" varchar(64) null references "billing_quotations" ("id") on delete set null;`,
    );
    this.addSql(
      `create index if not exists "onboarding_payments_quotation_idx" on "onboarding_payments" ("quotation_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "onboarding_payments_quotation_idx";`);
    this.addSql(
      `alter table "onboarding_payments" drop column if exists "quotation_id";`,
    );
    this.addSql(`drop table if exists "billing_quotation_lines";`);
    this.addSql(`drop table if exists "billing_quotations";`);
  }
}
