import { Migration } from "@mikro-orm/migrations";

export class Migration20260709000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "fleet_geofence_zones"
        add column if not exists "zone_type" varchar(64) not null default 'general',
        add column if not exists "center_latitude" double precision null,
        add column if not exists "center_longitude" double precision null,
        add column if not exists "dwell_minutes" int null,
        add column if not exists "speed_limit_enabled" boolean not null default false,
        add column if not exists "speed_limit_kph" double precision null,
        add column if not exists "schedule_enabled" boolean not null default false,
        add column if not exists "schedule_timezone" varchar(64) null,
        add column if not exists "schedule_days" jsonb not null default '[]',
        add column if not exists "schedule_start_time" varchar(8) null,
        add column if not exists "schedule_end_time" varchar(8) null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "fleet_geofence_zones"
        drop column if exists "zone_type",
        drop column if exists "center_latitude",
        drop column if exists "center_longitude",
        drop column if exists "dwell_minutes",
        drop column if exists "speed_limit_enabled",
        drop column if exists "speed_limit_kph",
        drop column if exists "schedule_enabled",
        drop column if exists "schedule_timezone",
        drop column if exists "schedule_days",
        drop column if exists "schedule_start_time",
        drop column if exists "schedule_end_time";
    `);
  }
}
