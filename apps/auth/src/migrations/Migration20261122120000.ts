import { Migration } from "@mikro-orm/migrations";

/** Platform contact details and support commitments, edited on the admin Settings page. */
export class Migration20261122120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "system_settings" add column if not exists "profile" jsonb null;`);
    this.addSql(`alter table "system_settings" add column if not exists "support" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "system_settings" drop column if exists "support";`);
    this.addSql(`alter table "system_settings" drop column if exists "profile";`);
  }
}
