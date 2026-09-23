import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { PREDEFINED_ROLES } from "@shared/access";

const FIXTURE = `${__dirname}/../../fixtures/predefined-roles.json`;

// The Go services embed this file to know each role's bundle. Regenerate with
// UPDATE_FIXTURES=1 and copy it to pkg/identity/predefined_roles.json there.
describe("predefined roles shared with the Go services", () => {
  it("match the committed copy", () => {
    const current = JSON.stringify(PREDEFINED_ROLES, null, 2) + "\n";
    if (process.env.UPDATE_FIXTURES || !existsSync(FIXTURE)) writeFileSync(FIXTURE, current);
    expect(readFileSync(FIXTURE, "utf8")).toBe(current);
  });
});
