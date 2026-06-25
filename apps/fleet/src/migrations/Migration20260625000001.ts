import { Migration } from "@mikro-orm/migrations";

export class Migration20260625000001 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "fleet_devices"
      add column if not exists "traccar_device_id" varchar(64) null;
    `);
    this.addSql(`
      alter table "fleet_devices"
      add column if not exists "provision_status" varchar(16) null default 'pending';
    `);
  }
}
