import { Migration } from '@mikro-orm/migrations';

export class Migration20261001020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "onboarding_payments" alter column "amount_kobo" type bigint;`);
    this.addSql(`alter table "onboarding_payments" add column if not exists "authorization_url" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "onboarding_payments" drop column if exists "authorization_url";`);
    this.addSql(`alter table "onboarding_payments" alter column "amount_kobo" type int;`);
  }
}
