import { Migration } from '@mikro-orm/migrations';

export class Migration20260617130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "system_tenant_onboardings" add column if not exists "onboarding_completed_at" timestamptz null;`,
    );
    this.addSql(
      `alter table "system_tenant_onboardings" add column if not exists "payment_reference" varchar(255) null;`,
    );
    this.addSql(
      `alter table "system_tenant_onboardings" add column if not exists "subscription_activated_at" timestamptz null;`,
    );

    this.addSql(
      `create table if not exists "tenant_business_info" (
        "tenant_id" varchar(64) not null,
        "company_name" varchar(255) not null,
        "registration_number" varchar(128) null,
        "tax_id" varchar(128) null,
        "business_type" varchar(64) null,
        "industry" varchar(128) null,
        "address_line1" varchar(255) null,
        "address_line2" varchar(255) null,
        "city" varchar(128) null,
        "state" varchar(128) null,
        "postal_code" varchar(32) null,
        "country" varchar(64) null,
        "phone" varchar(32) null,
        "email" varchar(255) null,
        "billing_email" varchar(255) null,
        "website" varchar(255) null,
        "year_established" int null,
        "number_of_employees" int null,
        "verification_status" varchar(32) not null default 'pending',
        "updated_at" timestamptz not null default now(),
        constraint "tenant_business_info_pkey" primary key ("tenant_id")
      );`,
    );

    this.addSql(
      `create table if not exists "tenant_kyc_documents" (
        "id" varchar(255) not null,
        "tenant_id" varchar(64) not null,
        "document_type" varchar(64) not null,
        "document_name" varchar(255) not null,
        "file_key" varchar(512) not null,
        "file_size" int not null default 0,
        "status" varchar(32) not null default 'pending',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "tenant_kyc_documents_pkey" primary key ("id")
      );`,
    );
    this.addSql(
      `create index if not exists "tenant_kyc_documents_tenant_id_index" on "tenant_kyc_documents" ("tenant_id");`,
    );

    this.addSql(
      `create table if not exists "tenant_device_provisioning_requests" (
        "id" varchar(255) not null,
        "tenant_id" varchar(64) not null,
        "manufacturer" varchar(128) not null,
        "model" varchar(128) not null,
        "quantity" int not null default 1,
        "use_case" text null,
        "requester_notes" text null,
        "status" varchar(32) not null default 'pending',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "tenant_device_provisioning_requests_pkey" primary key ("id")
      );`,
    );
    this.addSql(
      `create index if not exists "tenant_device_provisioning_requests_tenant_id_index" on "tenant_device_provisioning_requests" ("tenant_id");`,
    );
  }
}
