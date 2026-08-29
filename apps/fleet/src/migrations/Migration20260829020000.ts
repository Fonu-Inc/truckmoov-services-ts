import { Migration } from "@mikro-orm/migrations";

export class Migration20260829020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "fleet_devices" add column if not exists "reported_protocol" varchar(32) null`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fleet_devices" drop column if exists "reported_protocol"`);
  }
}
