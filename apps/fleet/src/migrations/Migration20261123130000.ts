import { Migration } from "@mikro-orm/migrations";

/** Pickup point a device request is collected from; null on requests made before it was required. */
export class Migration20261123130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "fleet_device_setup_requests" add column if not exists "pickup_location_id" varchar(64) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fleet_device_setup_requests" drop column if exists "pickup_location_id";`);
  }
}
