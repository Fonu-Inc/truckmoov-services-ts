import { Migration } from '@mikro-orm/migrations';

export class Migration20261007090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "onboarding_payments"
      add column if not exists "received_amount_kobo" bigint null,
      add column if not exists "received_currency" varchar(8) null,
      add column if not exists "review_outcome" varchar(20) null,
      add column if not exists "review_note" text null,
      add column if not exists "reviewed_by" varchar(64) null,
      add column if not exists "reviewed_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "onboarding_payments"
      drop column if exists "received_amount_kobo",
      drop column if exists "received_currency",
      drop column if exists "review_outcome",
      drop column if exists "review_note",
      drop column if exists "reviewed_by",
      drop column if exists "reviewed_at";`);
  }
}
