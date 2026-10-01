import { describe, expect, it } from "vitest";
import { Migration20261003010000 } from "../../../apps/fleet/src/migrations/Migration20261003010000";

function queries(direction: "up" | "down"): string[] {
  const migration = new Migration20261003010000(null as never, null as never);
  void migration[direction]();
  return migration.getQueries().map((q) => String(q).replace(/\s+/g, " ").trim());
}

const STATUS_CASE =
  `case "status" when 'pending_review' then 'under_review' when 'approved' then 'ready_for_installation' ` +
  `when 'in_progress' then 'installation_in_progress' when 'provisioned' then 'installation_in_progress' ` +
  `when 'assigned' then 'completed' else "status" end`;

describe("device request lifecycle migration", () => {
  const up = queries("up");

  it("makes manufacturer and tracker type optional", () => {
    expect(up).toContain(`alter table "fleet_device_setup_requests" alter column "manufacturer" drop not null;`);
    expect(up).toContain(`alter table "fleet_device_setup_requests" alter column "tracker_type" drop not null;`);
  });

  it("backfills references oldest first before requiring them, then makes them unique", () => {
    const add = up.indexOf(`alter table "fleet_device_setup_requests" add column if not exists "reference_number" varchar(16) null;`);
    const backfill = up.findIndex((q) => q.startsWith(`update "fleet_device_setup_requests" r set "reference_number" = 'DVR-' || (100000 + n.rn)::text`));
    const required = up.indexOf(`alter table "fleet_device_setup_requests" alter column "reference_number" set not null;`);
    const unique = up.indexOf(
      `create unique index if not exists "fleet_device_setup_requests_reference_number_unique" on "fleet_device_setup_requests" ("reference_number");`,
    );

    expect(add).toBeGreaterThanOrEqual(0);
    expect(backfill).toBeGreaterThan(add);
    expect(up[backfill]).toContain(`row_number() over (order by "created_at", "id")`);
    expect(up[backfill]).toContain(`where "reference_number" is null`);
    expect(required).toBeGreaterThan(backfill);
    expect(unique).toBeGreaterThan(required);
  });

  it("maps every old status onto the design lifecycle", () => {
    expect(up).toContain(
      `update "fleet_device_setup_requests" set "status" = ${STATUS_CASE} ` +
        `where "status" in ('pending_review', 'approved', 'in_progress', 'provisioned', 'assigned');`,
    );
  });

  it("rewrites timeline entry statuses the same way, keeping order and other fields", () => {
    const timeline = up.find((q) => q.includes(`set "timeline"`))!;
    expect(timeline).toContain(STATUS_CASE.replaceAll(`"status"`, `(e.entry->>'status')`));
    expect(timeline).toContain(`jsonb_set(e.entry, '{status}', to_jsonb(`);
    expect(timeline).toContain(`jsonb_array_elements("timeline") with ordinality as e(entry, ord)`);
    expect(timeline).toContain(`order by e.ord`);
    expect(timeline).not.toMatch(/\?\s*'/);
  });

  it("defaults new rows to under_review", () => {
    expect(up.at(-1)).toBe(`alter table "fleet_device_setup_requests" alter column "status" set default 'under_review';`);
  });

  it("rolls the statuses and references back", () => {
    const down = queries("down");
    expect(down).toContain(`alter table "fleet_device_setup_requests" alter column "status" set default 'pending_review';`);
    expect(down.find((q) => q.includes(`set "status"`))).toContain(
      `when 'awaiting_payment' then 'approved' when 'ready_for_installation' then 'approved'`,
    );
    expect(down).toContain(`alter table "fleet_device_setup_requests" drop column if exists "reference_number";`);
  });
});
