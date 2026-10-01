import { describe, expect, it } from "vitest";
import { Migration20261005020000 } from "../../../apps/auth/src/migrations/Migration20261005020000";

describe("test catalogue row cleanup", () => {
  it("deletes only the row named exactly testing+manu", async () => {
    const migration = new Migration20261005020000(null as never, null as never);
    await migration.up();

    expect(migration.getQueries().map(String)).toEqual([
      `delete from "system_device_models" where "manufacturer" = 'testing+manu';`,
    ]);
  });
});
