import { Migration } from '@mikro-orm/migrations';

/**
 * Money taken for an application, before any tenant exists to bill.
 *
 * The reference is unique because it is what a provider callback carries back:
 * two rows answering to one reference would mean a callback that settles an
 * arbitrary one of them.
 */
export class Migration20260922070000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "onboarding_applications" add column if not exists "billing_email" varchar(254) null;`,
    );
    this.addSql(
      `alter table "onboarding_applications" add column if not exists "billing_email_verified_at" timestamptz null;`,
    );

    this.addSql(`create table if not exists "onboarding_payments" (
      "id" varchar(64) not null,
      "application_id" varchar(64) not null,
      "reference" varchar(64) not null,
      "provider" varchar(40) not null,
      "amount_kobo" int not null,
      "billing_email" varchar(254) not null,
      "plan_code" varchar(64) not null,
      "device_count" int not null,
      "status" varchar(20) not null default 'pending',
      "paid_at" timestamptz null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "onboarding_payments_pkey" primary key ("id")
    );`);
    this.addSql(
      `create unique index if not exists "onboarding_payments_reference_unique" on "onboarding_payments" ("reference");`,
    );
    this.addSql(
      `create index if not exists "onboarding_payments_application_id_index" on "onboarding_payments" ("application_id");`,
    );
    this.addSql(
      `create index if not exists "onboarding_payments_status_index" on "onboarding_payments" ("status");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "onboarding_payments";`);
    this.addSql(
      `alter table "onboarding_applications" drop column if exists "billing_email_verified_at";`,
    );
    this.addSql(
      `alter table "onboarding_applications" drop column if exists "billing_email";`,
    );
  }
}
