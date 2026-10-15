import { Migration } from "@mikro-orm/migrations";

/** One live device per IMEI platform-wide, so another tenant cannot claim a fitted unit. */
export class Migration20261015120500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create unique index if not exists "fleet_devices_live_imei_unique" on "fleet_devices" ("imei") where "lifecycle_status" <> 'decommissioned';`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "fleet_devices_live_imei_unique";`);
  }
}
