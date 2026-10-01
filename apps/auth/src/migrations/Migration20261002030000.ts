import { Migration } from '@mikro-orm/migrations';

/**
 * Invoices issued when a quotation is paid, and the payment columns that tie
 * the history back to them.
 *
 * quotation_id is unique so a replayed settlement can never produce a second
 * invoice for the same quotation.
 */
export class Migration20261002030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "billing_invoices" (
      "id" varchar(64) not null,
      "number" varchar(32) not null,
      "prefix" varchar(12) not null,
      "year" int not null,
      "sequence" int not null,
      "quotation_id" varchar(64) null,
      "application_id" varchar(64) null,
      "tenant_id" varchar(64) null,
      "customer_name" varchar(200) not null,
      "customer_type" varchar(32) not null,
      "billing_email" varchar(254) not null,
      "status" varchar(20) not null,
      "issue_date" date not null,
      "due_date" date not null,
      "subtotal_kobo" bigint not null,
      "discount_kobo" bigint not null default 0,
      "tax_rate_bp" int not null default 0,
      "tax_kobo" bigint not null default 0,
      "total_kobo" bigint not null,
      "amount_paid_kobo" bigint not null default 0,
      "emailed_at" timestamptz null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "billing_invoices_pkey" primary key ("id"),
      constraint "billing_invoices_number_key" unique ("number"),
      constraint "billing_invoices_quotation_key" unique ("quotation_id"),
      constraint "billing_invoices_quotation_fk" foreign key ("quotation_id") references "billing_quotations" ("id") on delete set null
    );`);
    this.addSql(
      `create index if not exists "billing_invoices_application_idx" on "billing_invoices" ("application_id");`,
    );
    this.addSql(
      `create index if not exists "billing_invoices_status_idx" on "billing_invoices" ("status");`,
    );
    this.addSql(
      `create index if not exists "billing_invoices_created_idx" on "billing_invoices" ("created_at" desc, "id" desc);`,
    );
    this.addSql(
      `create index if not exists "billing_invoices_due_idx" on "billing_invoices" ("due_date");`,
    );

    this.addSql(`create table if not exists "billing_invoice_lines" (
      "id" varchar(64) not null,
      "invoice_id" varchar(64) not null,
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
      constraint "billing_invoice_lines_pkey" primary key ("id"),
      constraint "billing_invoice_lines_invoice_fk" foreign key ("invoice_id") references "billing_invoices" ("id") on delete cascade
    );`);
    this.addSql(
      `create index if not exists "billing_invoice_lines_invoice_idx" on "billing_invoice_lines" ("invoice_id");`,
    );

    this.addSql(
      `alter table "onboarding_payments" add column if not exists "invoice_id" varchar(64) null references "billing_invoices" ("id") on delete set null;`,
    );
    this.addSql(
      `alter table "onboarding_payments" add column if not exists "method" varchar(20) null;`,
    );
    this.addSql(
      `alter table "onboarding_payments" add column if not exists "customer_name" varchar(200) null;`,
    );
    this.addSql(
      `alter table "onboarding_payments" add column if not exists "note" text null;`,
    );
    this.addSql(
      `alter table "onboarding_payments" add column if not exists "auto_reconciled" boolean not null default true;`,
    );
    this.addSql(
      `create index if not exists "onboarding_payments_invoice_idx" on "onboarding_payments" ("invoice_id");`,
    );
    this.addSql(
      `create index if not exists "onboarding_payments_created_idx" on "onboarding_payments" ("created_at" desc, "id" desc);`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "onboarding_payments_created_idx";`);
    this.addSql(`drop index if exists "onboarding_payments_invoice_idx";`);
    this.addSql(`alter table "onboarding_payments" drop column if exists "auto_reconciled";`);
    this.addSql(`alter table "onboarding_payments" drop column if exists "note";`);
    this.addSql(`alter table "onboarding_payments" drop column if exists "customer_name";`);
    this.addSql(`alter table "onboarding_payments" drop column if exists "method";`);
    this.addSql(`alter table "onboarding_payments" drop column if exists "invoice_id";`);
    this.addSql(`drop table if exists "billing_invoice_lines";`);
    this.addSql(`drop table if exists "billing_invoices";`);
  }
}
