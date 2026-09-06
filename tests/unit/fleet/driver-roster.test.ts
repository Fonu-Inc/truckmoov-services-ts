import { describe, expect, it } from "vitest";
import {
  applyDriverRosterFilters,
  buildDriverAllowance,
  scoreBandFor,
  ownedDriverIdsFrom,
  summarizeDriverStatuses,
  tripBandFor,
  type DriverRosterRow,
} from "../../../apps/fleet/src/contexts/fleet/drivers/domain/driver-roster";

function driver(overrides: Partial<DriverRosterRow> = {}): DriverRosterRow {
  return {
    id: "d1",
    name: "Chukwuemeka Okafor",
    phone: "+2348012345678",
    email: "chukwuemeka.o@email.com",
    licenseNumber: "DL-2345-6789",
    status: "active",
    behaviorScore: 94,
    trips: 342,
    preferredChannel: "whatsapp",
    ...overrides,
  };
}

describe("Driver score and trip bands", () => {
  it("bands a score the way the roster chip does", () => {
    expect(scoreBandFor(94)).toBe("excellent");
    expect(scoreBandFor(90)).toBe("excellent");
    expect(scoreBandFor(84)).toBe("strong");
    expect(scoreBandFor(60)).toBe("fair");
    expect(scoreBandFor(59)).toBe("poor");
  });

  // No score is not a bad score. A new driver must not be filtered in with the
  // worst performers.
  it("bands a missing score as unscored", () => {
    expect(scoreBandFor(null)).toBe("unscored");
    expect(scoreBandFor(undefined)).toBe("unscored");
  });

  it("bands trip counts", () => {
    expect(tripBandFor(0)).toBe("0");
    expect(tripBandFor(50)).toBe("1-50");
    expect(tripBandFor(200)).toBe("51-200");
    expect(tripBandFor(342)).toBe("201-500");
    expect(tripBandFor(900)).toBe("500+");
  });
});

describe("Driver roster search", () => {
  const roster = [
    driver({ id: "d1", name: "Chukwuemeka Okafor", phone: "+2348012345678", licenseNumber: "DL-2345-6789" }),
    driver({ id: "d2", name: "Adebayo Johnson", phone: "+2348023456789", licenseNumber: "DL-3456-7890" }),
  ];

  it("matches on name and licence", () => {
    expect(applyDriverRosterFilters(roster, { query: "adebayo" }).map((d) => d.id)).toEqual(["d2"]);
    expect(applyDriverRosterFilters(roster, { query: "DL-2345" }).map((d) => d.id)).toEqual(["d1"]);
  });

  // An operator types the number as they have it written down, not in E.164.
  it("matches a phone number however it is punctuated", () => {
    for (const term of ["0801 234 5678", "8012345678", "+234 801"]) {
      expect(applyDriverRosterFilters(roster, { query: term }).map((d) => d.id)).toContain("d1");
    }
  });

  it("does not treat a one or two character query as a phone fragment", () => {
    expect(applyDriverRosterFilters(roster, { query: "80" })).toHaveLength(0);
  });

  it("returns everything when the query is blank", () => {
    expect(applyDriverRosterFilters(roster, { query: "   " })).toHaveLength(2);
  });
});

describe("Driver roster filters", () => {
  const roster = [
    driver({ id: "d1", behaviorScore: 94, trips: 342, preferredChannel: "whatsapp" }),
    driver({ id: "d2", behaviorScore: 62, trips: 12, preferredChannel: "sms" }),
    driver({ id: "d3", behaviorScore: null, trips: 0, preferredChannel: "whatsapp" }),
  ];

  it("filters by score band, trip band and channel", () => {
    expect(applyDriverRosterFilters(roster, { scoreBand: "excellent" }).map((d) => d.id)).toEqual(["d1"]);
    expect(applyDriverRosterFilters(roster, { tripBand: "1-50" }).map((d) => d.id)).toEqual(["d2"]);
    expect(applyDriverRosterFilters(roster, { preferredChannel: "whatsapp" }).map((d) => d.id)).toEqual([
      "d1",
      "d3",
    ]);
  });

  it("combines facets with the search term", () => {
    expect(
      applyDriverRosterFilters(roster, { preferredChannel: "whatsapp", scoreBand: "unscored" }).map((d) => d.id),
    ).toEqual(["d3"]);
  });
});

describe("Driver roster summary", () => {
  it("counts the five status cards", () => {
    const counts = summarizeDriverStatuses([
      { status: "active" },
      { status: "active" },
      { status: "available" },
      { status: "offline" },
      { status: "suspended" },
    ]);
    expect(counts).toEqual({ total: 5, active: 2, available: 1, offline: 1, suspended: 1 });
  });

  it("builds the allowance bar, and reports unlimited as unlimited", () => {
    expect(buildDriverAllowance(10, 5)).toEqual({
      limit: 10,
      used: 5,
      remaining: 5,
      usedPercent: 50,
      unlimited: false,
    });
    expect(buildDriverAllowance(null, 5)).toEqual({
      limit: null,
      used: 5,
      remaining: null,
      usedPercent: null,
      unlimited: true,
    });
  });

  it("never reports negative headroom when a tenant is over its plan", () => {
    expect(buildDriverAllowance(5, 8).remaining).toBe(0);
  });
});

describe("Owner operator scoping", () => {
  const drivers = [
    { id: "mine", assignedVehicleId: "v1" },
    { id: "also-mine", assignedVehicleId: "v2" },
    { id: "theirs", assignedVehicleId: "v9" },
    { id: "unassigned", assignedVehicleId: null },
  ];

  // The hole the security review caught: an owner operator holding a seat
  // inside somebody else's tenant must not read the rest of that tenant.
  it("owns only the drivers assigned to its own vehicles", () => {
    const owned = ownedDriverIdsFrom(["v1", "v2"], drivers);
    expect([...owned].sort()).toEqual(["also-mine", "mine"]);
    expect(owned.has("theirs")).toBe(false);
  });

  // An unassigned driver belongs to the tenant at large, not to one operator.
  it("does not hand an unassigned driver to an owner operator", () => {
    expect(ownedDriverIdsFrom(["v1"], drivers).has("unassigned")).toBe(false);
  });

  it("owns nobody when the operator has no vehicles", () => {
    expect(ownedDriverIdsFrom([], drivers).size).toBe(0);
  });
});
