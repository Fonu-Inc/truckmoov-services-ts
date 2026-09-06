import { describe, expect, it } from "vitest";
import {
  applyVehicleSearch,
  matchesVehicleQuery,
} from "../../../apps/fleet/src/contexts/fleet/tracking/domain/vehicle-search";
import { ShareLinkLifecycleService } from "../../../apps/fleet/src/share-link-lifecycle.service";
import { InMemoryShareLinkRepository } from "../../../apps/fleet/src/contexts/fleet/tracking/infrastructure/in-memory-share-link.repository";
import {
  hashShareToken,
  mintShareToken,
  shareLinkIsLive,
  shareTokenMatches,
} from "../../../apps/fleet/src/contexts/fleet/tracking/domain/share-token";

const FLEET = [
  { registrationNumber: "LAG-234-XY", make: "Mercedes", model: "Actros 2545", driverName: "Chukwuemeka Okafor" },
  { registrationNumber: "LAG-567-AB", make: "MAN", model: "TGS 33.480", driverName: "Adebayo Johnson" },
  { registrationNumber: "LAG-890-CD", make: "Volvo", model: "FH16 750", driverName: null },
];

describe("Vehicle search", () => {
  it("matches on plate, make, model and driver", () => {
    expect(applyVehicleSearch(FLEET, "LAG-234").map((v) => v.registrationNumber)).toEqual(["LAG-234-XY"]);
    expect(applyVehicleSearch(FLEET, "volvo").map((v) => v.registrationNumber)).toEqual(["LAG-890-CD"]);
    expect(applyVehicleSearch(FLEET, "actros").map((v) => v.registrationNumber)).toEqual(["LAG-234-XY"]);
    expect(applyVehicleSearch(FLEET, "adebayo").map((v) => v.registrationNumber)).toEqual(["LAG-567-AB"]);
  });

  // An operator types the plate however it is written on the truck.
  it("matches a plate with or without its punctuation", () => {
    for (const term of ["LAG234XY", "lag-234-xy", "lag 234 xy"]) {
      expect(applyVehicleSearch(FLEET, term)).toHaveLength(1);
    }
  });

  it("returns everything for a blank query", () => {
    expect(applyVehicleSearch(FLEET, "   ")).toHaveLength(3);
    expect(applyVehicleSearch(FLEET, undefined)).toHaveLength(3);
  });

  it("does not fall over on a vehicle with no driver", () => {
    expect(matchesVehicleQuery(FLEET[2], "volvo")).toBe(true);
    expect(matchesVehicleQuery(FLEET[2], "adebayo")).toBe(false);
  });
});

describe("Share tokens", () => {
  it("mints a token that only matches its own hash", () => {
    const { token, tokenHash } = mintShareToken();

    expect(shareTokenMatches(token, tokenHash)).toBe(true);
    expect(shareTokenMatches(`${token}x`, tokenHash)).toBe(false);
  });

  // The token is a bearer credential. A leaked row must show that a link
  // exists, not how to open it.
  it("never stores the token itself", () => {
    const { token, tokenHash } = mintShareToken();
    expect(tokenHash).not.toContain(token);
    expect(tokenHash).toHaveLength(64);
  });

  it("hashes deterministically", () => {
    expect(hashShareToken("abc")).toBe(hashShareToken("abc"));
    expect(hashShareToken("abc")).not.toBe(hashShareToken("abd"));
  });

  it("does not throw on a malformed candidate", () => {
    expect(shareTokenMatches("not-hex", "aa")).toBe(false);
  });
});

describe("Share link lifetime", () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);

  it("is live inside its window", () => {
    expect(shareLinkIsLive({ expiresAt: future, revokedAt: null })).toBe(true);
  });

  it("dies at expiry and on revocation", () => {
    expect(shareLinkIsLive({ expiresAt: past, revokedAt: null })).toBe(false);
    expect(shareLinkIsLive({ expiresAt: future, revokedAt: new Date() })).toBe(false);
  });
});

describe("Share link lifecycle", () => {
  function build() {
    const links = new InMemoryShareLinkRepository();
    const bus = { subscribe: async () => {}, publish: async () => {} };
    const service = new ShareLinkLifecycleService(bus as never, links, {} as never);
    return { links, service };
  }

  async function seed(
    links: InMemoryShareLinkRepository,
    overrides: { id: string; jobId: string | null; expiresAt: Date },
  ) {
    await links.save({
      tenantId: "tenant-a",
      vehicleId: "v1",
      tokenHash: `hash-${overrides.id}`,
      createdBy: "user-1",
      createdAt: new Date(),
      revokedAt: null,
      lastViewedAt: null,
      viewCount: 0,
      ...overrides,
    });
  }

  const future = () => new Date(Date.now() + 60 * 60 * 1000);

  // A customer's link is scoped to their delivery. Leaving it live once the
  // truck moves on shows them freight that is no longer theirs.
  it("revokes a link when its job is delivered or cancelled", async () => {
    for (const status of ["delivered", "cancelled"]) {
      const { links, service } = build();
      await seed(links, { id: `l-${status}`, jobId: "job-1", expiresAt: future() });

      expect(await service.revokeIfJobEnded({ jobId: "job-1", newStatus: status })).toBe(1);
      expect(await links.findActiveForVehicle("tenant-a", "v1")).toBeNull();
    }
  });

  it("leaves a link alone while its job is still running", async () => {
    const { links, service } = build();
    await seed(links, { id: "l1", jobId: "job-1", expiresAt: future() });

    expect(await service.revokeIfJobEnded({ jobId: "job-1", newStatus: "en-route" })).toBe(0);
    expect(await links.findActiveForVehicle("tenant-a", "v1")).not.toBeNull();
  });

  it("ignores an event with no job", async () => {
    const { service } = build();
    expect(await service.revokeIfJobEnded({ newStatus: "delivered" })).toBe(0);
  });

  // A job that is never marked delivered would otherwise leave its row behind
  // for good.
  it("reaps a link a day after it expired, and keeps a fresh one", async () => {
    const { links, service } = build();
    await seed(links, {
      id: "stale",
      jobId: null,
      expiresAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });
    await seed(links, {
      id: "recent",
      jobId: null,
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    expect(await service.reap()).toBe(1);
    expect(await links.findByTokenHash("hash-stale")).toBeNull();
    expect(await links.findByTokenHash("hash-recent")).not.toBeNull();
  });
});

