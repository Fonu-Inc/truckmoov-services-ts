import { Migration } from '@mikro-orm/migrations';

/** Records the exact stock amount an applicant accepted instead of silently reducing their fleet request. */
export class Migration20260928020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "onboarding_device_requests"
      add column if not exists "confirmed_available_quantity" int null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "onboarding_device_requests" drop column if exists "confirmed_available_quantity";`);
  }
}
