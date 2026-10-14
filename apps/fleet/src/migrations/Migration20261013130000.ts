import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { Migration } from "@mikro-orm/migrations";

const DATA_FILE = join(process.cwd(), "apps/fleet/data/nigeria-built-up-areas.geojson.gz");
const BATCH = 250;

type Feature = { properties: { kind: string }; geometry: unknown };

/**
 * Built-up areas (towns and cities) from the GHSL settlement model, so a road
 * speed limit can tell a highway through a town from open road. Built by
 * apps/fleet/scripts/ghsl/build_built_up_areas.py; re-run it and add a
 * migration like this one to refresh after a new GHSL release.
 */
export class Migration20261013130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fleet_built_up_areas" (
      "id" serial primary key,
      "kind" varchar(32) not null,
      "source" varchar(64) not null,
      "geom" geography(Polygon, 4326) not null
    );`);
    this.addSql(
      `create index if not exists "fleet_built_up_areas_geom_gist" on "fleet_built_up_areas" using gist ("geom");`,
    );

    const data = JSON.parse(gunzipSync(readFileSync(DATA_FILE)).toString("utf8")) as {
      source: string;
      features: Feature[];
    };
    this.addSql(this.getKnex().raw(`delete from "fleet_built_up_areas" where "source" = ?`, [data.source]));
    for (let i = 0; i < data.features.length; i += BATCH) {
      const batch = data.features.slice(i, i + BATCH);
      const rows = batch.map(() => "(?, ?, ST_SetSRID(ST_GeomFromGeoJSON(?), 4326)::geography)").join(", ");
      const bindings = batch.flatMap((f) => [f.properties.kind, data.source, JSON.stringify(f.geometry)]);
      this.addSql(this.getKnex().raw(`insert into "fleet_built_up_areas" ("kind", "source", "geom") values ${rows}`, bindings));
    }
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_built_up_areas";`);
  }
}
