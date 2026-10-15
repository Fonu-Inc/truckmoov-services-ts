import { Migration } from "@mikro-orm/migrations";

/**
 * Zone polygons are [lng, lat] pairs, as the API documents and the web reads
 * them; Migration20261013110000 read them as [lat, lng]. A zero radius is not
 * a circle: the web sends radius 0 with a center for a polygon zone.
 */
export class Migration20261015120600 extends Migration {
  override async up(): Promise<void> {
    this.addSql(zoneGeomFunction({ lng: 0, lat: 1, circle: "radius > 0" }));
    this.addSql(`update "fleet_geofence_zones" set coordinates = coordinates;`);
  }

  override async down(): Promise<void> {
    this.addSql(zoneGeomFunction({ lng: 1, lat: 0, circle: "radius is not null" }));
    this.addSql(`update "fleet_geofence_zones" set coordinates = coordinates;`);
  }
}

function zoneGeomFunction(order: { lng: number; lat: number; circle: string }): string {
  return `
    create or replace function fleet_geofence_zone_geom(
      coordinates jsonb, center_lat double precision, center_lng double precision, radius double precision
    ) returns geography language plpgsql immutable as $$
    declare
      ring geometry;
      shape geometry;
    begin
      if ${order.circle} and center_lat is not null and center_lng is not null then
        return ST_Multi(
          ST_Buffer(ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography, radius, 'quad_segs=16')::geometry
        )::geography;
      end if;
      if coordinates is null or jsonb_typeof(coordinates) <> 'array' or jsonb_array_length(coordinates) < 3 then
        return null;
      end if;
      select ST_MakeLine(ST_MakePoint((p ->> ${order.lng})::float8, (p ->> ${order.lat})::float8) order by ord)
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
  `;
}
