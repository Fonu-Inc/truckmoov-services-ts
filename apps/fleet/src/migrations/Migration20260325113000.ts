import { Migration } from "@mikro-orm/migrations";

export class Migration20260325113000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "fleet_vehicles" add column if not exists "gps_imei" varchar(32) null;`,
    );
    this.addSql(
      `alter table "fleet_vehicles" add column if not exists "gps_manufacturer" varchar(64) null;`,
    );
    this.addSql(
      `alter table "fleet_vehicles" add column if not exists "gps_model" varchar(64) null;`,
    );
    this.addSql(
      `alter table "fleet_vehicles" add column if not exists "gps_firmware_version" varchar(32) null;`,
    );
  }
}
