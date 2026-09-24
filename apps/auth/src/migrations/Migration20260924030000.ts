import { Migration } from '@mikro-orm/migrations';

/** Catalogue models say what they are ("GPS Tracker"), so the installer's job details can show it. */
export class Migration20260924030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "system_device_models" add column if not exists "device_type" varchar(80) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "system_device_models" drop column if exists "device_type";`);
  }
}
