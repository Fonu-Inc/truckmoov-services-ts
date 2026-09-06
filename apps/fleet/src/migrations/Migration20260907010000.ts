import { Migration } from "@mikro-orm/migrations";

export class Migration20260907010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "fleet_devices" add column if not exists "name" varchar(120) null;`);
    this.addSql(
      `alter table "fleet_devices" add column if not exists "pre_suspension_lifecycle_status" varchar(32) null;`,
    );
    this.addSql(`alter table "fleet_devices" add column if not exists "suspended_at" timestamptz null;`);
    this.addSql(
      `alter table "fleet_devices" add column if not exists "suspension_reason" varchar(500) null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fleet_devices" drop column if exists "suspension_reason";`);
    this.addSql(`alter table "fleet_devices" drop column if exists "suspended_at";`);
    this.addSql(`alter table "fleet_devices" drop column if exists "pre_suspension_lifecycle_status";`);
    this.addSql(`alter table "fleet_devices" drop column if exists "name";`);
  }
}
