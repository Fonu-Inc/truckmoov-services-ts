import { Migration } from "@mikro-orm/migrations";

export class Migration20260830000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "fleet_waybills" add column if not exists "driver_id" varchar(64) null`);
    this.addSql(`create index if not exists "fleet_waybills_driver_id_index" on "fleet_waybills" ("driver_id")`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fleet_waybills" drop column if exists "driver_id"`);
  }
}
