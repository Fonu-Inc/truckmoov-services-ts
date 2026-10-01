import { describe, expect, it } from "vitest";
import { Migration20261002010000 } from "../../../apps/fleet/src/migrations/Migration20261002010000";

describe("fleet catalogue drop", () => {
  it("drops both fleet catalogue tables and nothing else", () => {
    const migration = new Migration20261002010000(null as never, null as never);
    migration.up();

    expect(migration.getQueries().map(String)).toEqual([
      'drop table if exists "fleet_data_bundles";',
      'drop table if exists "fleet_carriers";',
    ]);
  });
});
