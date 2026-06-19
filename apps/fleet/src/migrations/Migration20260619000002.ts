import { Migration } from "@mikro-orm/migrations";

export class Migration20260619000002 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "fleet_geofence_zones" (
        "id" varchar(255) not null primary key,
        "tenant_id" varchar(64) not null,
        "name" varchar(255) not null,
        "description" text null,
        "coordinates" jsonb not null,
        "radius_meters" float null,
        "status" varchar(16) not null default 'ACTIVE',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      );
    `);
    this.addSql(`create index if not exists "fleet_geofence_zones_tenant_idx" on "fleet_geofence_zones" ("tenant_id");`);
    this.addSql(`create index if not exists "fleet_geofence_zones_status_idx" on "fleet_geofence_zones" ("status");`);

    this.addSql(`
      create table if not exists "fleet_geofence_vehicle_assignments" (
        "zone_id" varchar(255) not null,
        "vehicle_id" varchar(255) not null,
        "tenant_id" varchar(64) not null,
        "created_at" timestamptz not null default now(),
        primary key ("zone_id", "vehicle_id")
      );
    `);
    this.addSql(`create index if not exists "fleet_geofence_assignments_zone_idx" on "fleet_geofence_vehicle_assignments" ("zone_id");`);
    this.addSql(`create index if not exists "fleet_geofence_assignments_vehicle_idx" on "fleet_geofence_vehicle_assignments" ("vehicle_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_geofence_vehicle_assignments";`);
    this.addSql(`drop table if exists "fleet_geofence_zones";`);
  }
}
