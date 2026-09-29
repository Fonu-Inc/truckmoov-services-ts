import { NotFoundException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareVehicleLocationUseCase } from "../../../apps/fleet/src/contexts/fleet/tracking/application/share-location.use-cases";
import { InMemoryShareLinkRepository } from "../../../apps/fleet/src/contexts/fleet/tracking/infrastructure/in-memory-share-link.repository";

const NOW = new Date("2026-09-29T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function job(deadline: string | null) {
  return {
    id: "j1",
    reference: "JOB-1",
    status: "assigned",
    assignedVehicleId: "v1",
    assignedDriverId: null,
    amountNgn: 0,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    pickupAddress: null,
    dropoffAddress: null,
    deadline,
    punctuality: null,
  };
}

function build(jobs: ReturnType<typeof job>[]) {
  const links = new InMemoryShareLinkRepository();
  const vehicles = { findById: vi.fn(async (id: string) => (id === "v1" ? { id } : null)) };
  const dispatchJobs = { listJobs: vi.fn(async () => jobs) };
  const config = { app: { tenantAppUrl: "https://app.test" } };
  const useCase = Reflect.construct(ShareVehicleLocationUseCase, [links, vehicles, dispatchJobs, config]) as ShareVehicleLocationUseCase;
  return { useCase, links };
}

const input = { tenantId: "t1", vehicleId: "v1", createdBy: "u1" };

describe("sharing a vehicle's location", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("expires two hours after a deadline still ahead", async () => {
    const deadline = new Date(NOW.getTime() + 3 * HOUR);
    const { useCase } = build([job(deadline.toISOString())]);

    const result = await useCase.execute(input);

    expect(result.expiresAt).toBe(new Date(deadline.getTime() + 2 * HOUR).toISOString());
  });

  // A late job is when the customer most wants the link.
  it("gives a job past its grace window a live 24 hour link, not an expired one", async () => {
    const { useCase } = build([job("2026-08-29T12:59:00.000Z")]);

    const result = await useCase.execute(input);

    expect(result.expiresAt).toBe(new Date(NOW.getTime() + 24 * HOUR).toISOString());
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("uses 24 hours for a job with no deadline", async () => {
    const { useCase } = build([job(null)]);

    const result = await useCase.execute(input);

    expect(result.expiresAt).toBe(new Date(NOW.getTime() + 24 * HOUR).toISOString());
  });

  it("does not mint a second link for a late job", async () => {
    const { useCase, links } = build([job("2026-08-29T12:59:00.000Z")]);

    const first = await useCase.execute(input);
    const second = await useCase.execute(input);

    expect(first.alreadyShared).toBe(false);
    expect(second.alreadyShared).toBe(true);
    expect(second.url).toBeNull();
    expect(await links.findActiveForVehicle("t1", "v1")).not.toBeNull();
  });

  it("answers both shapes with the same keys, jobReference included", async () => {
    const { useCase } = build([job(null)]);

    const first = await useCase.execute(input);
    const second = await useCase.execute(input);

    expect(Object.keys(second).sort()).toEqual(Object.keys(first).sort());
    expect(second.jobReference).toBe("JOB-1");
  });

  it("carries a null jobReference for a vehicle with no job", async () => {
    const { useCase } = build([]);

    const first = await useCase.execute(input);
    const second = await useCase.execute(input);

    expect(first.jobReference).toBeNull();
    expect(second.jobReference).toBeNull();
  });

  it("still answers 404 for a vehicle outside the caller's scope", async () => {
    const { useCase } = build([]);

    await expect(useCase.execute({ ...input, vehicleId: "elsewhere" })).rejects.toBeInstanceOf(NotFoundException);
  });
});
