import { Migration } from "@mikro-orm/migrations";

/**
 * The planned route of each vehicle's active job, for route deviation: a fix
 * outside a corridor around the line is off route. Shared by every replica,
 * unlike the hand-set bounding box GeofenceService keeps in one process.
 */
export class Migration20261013150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fleet_vehicle_planned_routes" (
      "vehicle_id" varchar(64) not null,
      "tenant_id" varchar(64) not null,
      "job_id" varchar(64) not null,
      "geom" geography(LineString, 4326) not null,
      "off_route_fixes" int not null default 0,
      "updated_at" timestamptz not null default now(),
      constraint "fleet_vehicle_planned_routes_pkey" primary key ("tenant_id", "vehicle_id")
    );`);
    this.addSql(
      `create index if not exists "fleet_vehicle_planned_routes_job_index" on "fleet_vehicle_planned_routes" ("tenant_id", "job_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_vehicle_planned_routes";`);
  }
}
