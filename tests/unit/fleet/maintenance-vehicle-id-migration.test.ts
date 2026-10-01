import { describe, expect, it } from "vitest";
import { Migration20261001010000 } from "../../../apps/fleet/src/migrations/Migration20261001010000";

function queries(): string[] {
  const migration = new Migration20261001010000(null as never, null as never);
  migration.up();
  return migration.getQueries().map((query) => String(query));
}

describe("maintenance plate-to-id migration", () => {
  it("rewrites records and profiles, matching plates in the same tenant", () => {
    const sql = queries();

    expect(sql).toHaveLength(2);
    expect(sql[0]).toContain('update "fleet_maintenance_records"');
    expect(sql[1]).toContain('update "fleet_maintenance_profiles"');
    for (const query of sql) {
      expect(query).toContain('v."tenant_id" = r."tenant_id"');
      expect(query).toContain('upper(trim(r."vehicle_id"))');
    }
  });

  it("leaves a row that already names a vehicle by id", () => {
    for (const query of queries()) expect(query).toContain("not exists");
  });
});
