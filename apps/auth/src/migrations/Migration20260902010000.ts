import { Migration } from '@mikro-orm/migrations';

export class Migration20260902010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "onboarding_applications" ("id" varchar(64) not null, "reference" varchar(32) not null, "token_hash" varchar(128) not null, "applicant_type" varchar(32) not null, "organization_name" varchar(160) not null, "business_email" varchar(254) not null, "organization_phone" varchar(20) not null, "contact_full_name" varchar(80) not null, "contact_role" varchar(80) not null, "street_address" varchar(200) not null, "city" varchar(80) not null, "state" varchar(64) not null, "email_verified_at" timestamptz null, "phone_verified_at" timestamptz null, "status" varchar(32) not null default 'draft', "submitted_at" timestamptz null, "reviewed_by" varchar(64) null, "reviewed_at" timestamptz null, "decision_reason" text null, "tenant_id" varchar(64) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "onboarding_applications_pkey" primary key ("id"));`);
    this.addSql(`create unique index if not exists "onboarding_applications_reference_unique" on "onboarding_applications" ("reference");`);
    this.addSql(`create unique index if not exists "onboarding_applications_token_hash_unique" on "onboarding_applications" ("token_hash");`);
    this.addSql(`create index if not exists "onboarding_applications_business_email_index" on "onboarding_applications" ("business_email");`);
    this.addSql(`create index if not exists "onboarding_applications_status_index" on "onboarding_applications" ("status");`);

    this.addSql(`create table if not exists "onboarding_application_documents" ("id" varchar(64) not null, "application_id" varchar(64) not null, "tenant_id" varchar(64) null, "document_type" varchar(64) not null, "document_name" varchar(255) not null, "file_key" varchar(512) not null, "file_size" int not null default 0, "mime_type" varchar(100) not null, "status" varchar(32) not null default 'pending', "rejection_reason" varchar(1000) null, "reviewed_by" varchar(64) null, "reviewed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "onboarding_application_documents_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "onboarding_application_documents_application_id_index" on "onboarding_application_documents" ("application_id");`);
    this.addSql(`create index if not exists "onboarding_application_documents_tenant_id_index" on "onboarding_application_documents" ("tenant_id");`);
    // One live file per document type: a re-upload replaces, never accumulates.
    this.addSql(`create unique index if not exists "onboarding_application_documents_type_unique" on "onboarding_application_documents" ("application_id", "document_type");`);
    this.addSql(`alter table "onboarding_application_documents" add constraint "onboarding_application_documents_application_fk" foreign key ("application_id") references "onboarding_applications" ("id") on delete cascade;`);

    this.addSql(`create table if not exists "onboarding_verification_codes" ("id" varchar(64) not null, "application_id" varchar(64) not null, "channel" varchar(16) not null, "code_hash" varchar(128) not null, "destination" varchar(254) not null, "attempts" int not null default 0, "consumed_at" timestamptz null, "expires_at" timestamptz not null, "created_at" timestamptz not null default now(), constraint "onboarding_verification_codes_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "onboarding_verification_codes_lookup_index" on "onboarding_verification_codes" ("application_id", "channel", "created_at");`);
    this.addSql(`alter table "onboarding_verification_codes" add constraint "onboarding_verification_codes_application_fk" foreign key ("application_id") references "onboarding_applications" ("id") on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "onboarding_verification_codes";`);
    this.addSql(`drop table if exists "onboarding_application_documents";`);
    this.addSql(`drop table if exists "onboarding_applications";`);
  }
}
