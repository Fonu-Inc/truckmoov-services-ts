import { Migration } from '@mikro-orm/migrations';

export class Migration20261008010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "onboarding_payments"
      add column if not exists "tenant_id" varchar(64) null,
      add column if not exists "refunded_at" timestamptz null,
      add column if not exists "refund_reference" varchar(64) null,
      add column if not exists "refund_error" text null,
      add column if not exists "refund_pending_at" timestamptz null,
      add column if not exists "refund_note" varchar(500) null,
      add column if not exists "refund_requested_by" varchar(64) null;`);
    this.addSql(`alter table "onboarding_applications"
      add column if not exists "payment_notified_at" timestamptz null;`);
    this.addSql(`alter table "enforcement_settings"
      add column if not exists "onboarding_trial_days_override" int null;`);
    this.addSql(`update "onboarding_payments" p set "tenant_id" = a."tenant_id"
      from "onboarding_applications" a
      where a."id" = p."application_id" and p."tenant_id" is null and a."tenant_id" is not null;`);
    this.addSql(`create index if not exists "onboarding_payments_tenant_id_idx"
      on "onboarding_payments" ("tenant_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "enforcement_settings" drop column if exists "onboarding_trial_days_override";`);
    this.addSql(`alter table "onboarding_applications" drop column if exists "payment_notified_at";`);
    this.addSql(`drop index if exists "onboarding_payments_tenant_id_idx";`);
    this.addSql(`alter table "onboarding_payments"
      drop column if exists "tenant_id",
      drop column if exists "refunded_at",
      drop column if exists "refund_reference",
      drop column if exists "refund_error",
      drop column if exists "refund_pending_at",
      drop column if exists "refund_note",
      drop column if exists "refund_requested_by";`);
  }
}
