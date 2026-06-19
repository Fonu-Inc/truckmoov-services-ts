import { Migration } from "@mikro-orm/migrations";

export class Migration20260619000004 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "fleet_compliance_documents" (
        "id" varchar(255) not null primary key,
        "tenant_id" varchar(64) not null,
        "vehicle_id" varchar(255) null,
        "document_type" varchar(64) not null,
        "document_name" varchar(255) not null,
        "issue_date" date null,
        "expiry_date" date null,
        "reminder_days" int not null default 30,
        "file_url" varchar(1024) null,
        "file_size" int null,
        "notes" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      );
    `);
    this.addSql(`create index if not exists "fleet_compliance_documents_tenant_idx" on "fleet_compliance_documents" ("tenant_id");`);
    this.addSql(`create index if not exists "fleet_compliance_documents_expiry_idx" on "fleet_compliance_documents" ("expiry_date");`);

    this.addSql(`
      create table if not exists "fleet_financial_configs" (
        "id" varchar(255) not null primary key,
        "tenant_id" varchar(64) not null,
        "vehicle_id" varchar(255) not null,
        "monthly_wages_ngn" numeric(14,2) null,
        "monthly_insurance_ngn" numeric(14,2) null,
        "monthly_depreciation_ngn" numeric(14,2) null,
        "monthly_other_ngn" numeric(14,2) null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        unique ("tenant_id", "vehicle_id")
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_compliance_documents";`);
    this.addSql(`drop table if exists "fleet_financial_configs";`);
  }
}
