import { Migration } from "@mikro-orm/migrations";

/**
 * Which vehicles are inside which geofence zones.
 *
 * Zones were configurable but never evaluated: entry, exit and dwell alerts
 * had no producer anywhere on the platform. Membership has to be durable for
 * the diff to mean anything across a restart or a second replica.
 */
export class Migration20260907030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fleet_zone_occupancy" (
      "id" varchar(64) not null,
      "tenant_id" varchar(64) not null,
      "vehicle_id" varchar(64) not null,
      "zone_id" varchar(64) not null,
      "entered_at" timestamptz not null default now(),
      "dwell_notified_at" timestamptz null,
      constraint "fleet_zone_occupancy_pkey" primary key ("id")
    );`);
    this.addSql(
      `create unique index if not exists "fleet_zone_occupancy_unique" on "fleet_zone_occupancy" ("tenant_id", "vehicle_id", "zone_id");`,
    );
    this.addSql(
      `create index if not exists "fleet_zone_occupancy_zone_index" on "fleet_zone_occupancy" ("tenant_id", "zone_id");`,
    );
    this.addSql(
      `create index if not exists "fleet_zone_occupancy_entered_index" on "fleet_zone_occupancy" ("entered_at");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_zone_occupancy";`);
  }
}
