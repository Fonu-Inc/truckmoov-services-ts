import { Migration } from '@mikro-orm/migrations';

/** A notice sent with inPlatformAlerts off still records its dedupe key, as a hidden row. */
export class Migration20260925170000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "installer_notifications" add column if not exists "hidden" boolean not null default false;`);
  }

  /** Hidden rows go with the flag, so they cannot surface in the inbox. */
  override async down(): Promise<void> {
    this.addSql(`delete from "installer_notifications" where "hidden";`);
    this.addSql(`alter table "installer_notifications" drop column if exists "hidden";`);
  }
}
