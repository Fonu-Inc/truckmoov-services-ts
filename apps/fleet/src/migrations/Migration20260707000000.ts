import { Migration } from "@mikro-orm/migrations";

export class Migration20260707000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "fleet_geofence_zones"
        add column if not exists "category" varchar(64) not null default 'general',
        add column if not exists "entry_alerts_enabled" boolean not null default true,
        add column if not exists "exit_alerts_enabled" boolean not null default true,
        add column if not exists "dwell_alerts_enabled" boolean not null default false;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "fleet_geofence_zones"
        drop column if exists "category",
        drop column if exists "entry_alerts_enabled",
        drop column if exists "exit_alerts_enabled",
        drop column if exists "dwell_alerts_enabled";
    `);
  }
}
