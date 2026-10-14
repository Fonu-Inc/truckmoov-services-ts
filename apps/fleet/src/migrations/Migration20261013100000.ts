import { Migration } from "@mikro-orm/migrations";

/**
 * Latest position per vehicle, shared by every fleet replica.
 *
 * Positions lived in each process's memory, but the location consumer hands
 * each fix to one replica only, so nearest-vehicle, recommendations and
 * last-seen each saw part of the fleet. PostGIS lets nearest be one indexed
 * query instead of loading every vehicle.
 *
 * Service roles cannot install PostGIS; an admin runs `create extension postgis`
 * once per database. Locally and in tests the role can, so it is created here.
 */
export class Migration20261013100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if not exists (select 1 from pg_extension where extname = 'postgis') then
          begin
            create extension postgis;
          exception when insufficient_privilege then
            raise exception 'PostGIS is not installed in database %. An admin must run: create extension postgis;', current_database();
          end;
        end if;
      end $$;
    `);
    this.addSql(`create table if not exists "fleet_vehicle_last_positions" (
      "vehicle_id" varchar(64) not null,
      "tenant_id" varchar(64) not null,
      "device_id" varchar(255) null,
      "geom" geography(Point, 4326) null,
      "recorded_at" timestamptz not null,
      "updated_at" timestamptz not null default now(),
      constraint "fleet_vehicle_last_positions_pkey" primary key ("tenant_id", "vehicle_id")
    );`);
    this.addSql(
      `create index if not exists "fleet_vehicle_last_positions_geom_gist" on "fleet_vehicle_last_positions" using gist ("geom");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_vehicle_last_positions";`);
  }
}
