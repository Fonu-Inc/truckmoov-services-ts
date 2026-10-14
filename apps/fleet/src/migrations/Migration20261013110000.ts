import { Migration } from "@mikro-orm/migrations";

/**
 * Zone shapes as PostGIS geography, so "which zones contain this fix" is one
 * indexed query instead of a loop over every zone in every replica's cache.
 *
 * `geom` is derived, never written by the app: a trigger rebuilds it from
 * `coordinates` ([lat, lng] pairs) or the circle columns, so it cannot drift
 * whoever writes the row. Circles are buffered into polygons so every zone
 * answers the same `ST_Covers` predicate. A self-intersecting polygon is
 * repaired into its valid parts rather than dropped, so a zone drawn as a bow
 * tie keeps its occupants; one with fewer than three points has no shape.
 */
export class Migration20261013110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "fleet_geofence_zones" add column if not exists "geom" geography(MultiPolygon, 4326) null;`,
    );
    this.addSql(`
      create or replace function fleet_geofence_zone_geom(
        coordinates jsonb, center_lat double precision, center_lng double precision, radius double precision
      ) returns geography language plpgsql immutable as $$
      declare
        ring geometry;
        shape geometry;
      begin
        if radius is not null and center_lat is not null and center_lng is not null then
          return ST_Multi(
            ST_Buffer(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography, radius, 'quad_segs=16')::geometry
          )::geography;
        end if;
        if coordinates is null or jsonb_typeof(coordinates) <> 'array' or jsonb_array_length(coordinates) < 3 then
          return null;
        end if;
        select ST_MakeLine(ST_MakePoint((p ->> 1)::float8, (p ->> 0)::float8) order by ord)
          into ring
          from jsonb_array_elements(coordinates) with ordinality as e(p, ord);
        if not ST_IsClosed(ring) then
          ring := ST_AddPoint(ring, ST_StartPoint(ring));
        end if;
        if ST_NPoints(ring) < 4 then
          return null;
        end if;
        shape := ST_SetSRID(ST_MakePolygon(ring), 4326);
        if not ST_IsValid(shape) then
          shape := ST_CollectionExtract(ST_MakeValid(shape), 3);
        end if;
        if ST_IsEmpty(shape) then
          return null;
        end if;
        return ST_Multi(shape)::geography;
      exception when others then
        return null;
      end $$;
    `);
    this.addSql(`
      create or replace function fleet_geofence_zones_set_geom() returns trigger language plpgsql as $$
      begin
        new.geom := fleet_geofence_zone_geom(new.coordinates, new.center_latitude, new.center_longitude, new.radius_meters);
        return new;
      end $$;
    `);
    this.addSql(`drop trigger if exists "fleet_geofence_zones_geom" on "fleet_geofence_zones";`);
    this.addSql(`
      create trigger "fleet_geofence_zones_geom"
      before insert or update of coordinates, center_latitude, center_longitude, radius_meters
      on "fleet_geofence_zones"
      for each row execute function fleet_geofence_zones_set_geom();
    `);
    this.addSql(`update "fleet_geofence_zones" set coordinates = coordinates;`);
    this.addSql(
      `create index if not exists "fleet_geofence_zones_geom_gist" on "fleet_geofence_zones" using gist ("geom");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop trigger if exists "fleet_geofence_zones_geom" on "fleet_geofence_zones";`);
    this.addSql(`drop function if exists fleet_geofence_zones_set_geom();`);
    this.addSql(`drop function if exists fleet_geofence_zone_geom(jsonb, double precision, double precision, double precision);`);
    this.addSql(`drop index if exists "fleet_geofence_zones_geom_gist";`);
    this.addSql(`alter table "fleet_geofence_zones" drop column if exists "geom";`);
  }
}
