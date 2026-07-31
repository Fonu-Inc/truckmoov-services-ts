import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryDriverRepository } from "../../../apps/fleet/src/contexts/fleet/drivers/infrastructure/repositories/in-memory-driver.repository";
import { Driver } from "../../../apps/fleet/src/contexts/fleet/drivers/domain/entities/driver.entity";

function makeDriver(id: string, tenantId = "t1", overrides: Partial<Parameters<typeof Driver.create>[0]> = {}) {
  return Driver.create({
    id,
    name: `Driver ${id}`,
    phone: `+23480000000${id}`,
    licenseNumber: `LIC-${id}`,
    licenseExpiryDate: "2026-08-15",
    tenantId,
    status: "available",
    communicationPreference: "whatsapp",
    assignedVehicleId: null,
    contactChannels: { whatsappNumber: null, smsNumber: null, voiceNumber: null },
    ...overrides,
  });
}

describe("InMemoryDriverRepository", () => {
  let repo: InMemoryDriverRepository;
  beforeEach(() => { repo = new InMemoryDriverRepository(); });

  it("saves and retrieves by id", async () => {
    const d = makeDriver("d1");
    await repo.save(d);
    expect(await repo.findById("d1", "t1")).toBe(d);
  });

  it("returns null for missing id", async () => {
    expect(await repo.findById("missing", "t1")).toBeNull();
  });

  it("returns null when tenant does not match", async () => {
    await repo.save(makeDriver("d1", "t1"));
    expect(await repo.findById("d1", "t2")).toBeNull();
  });

  it("findAll filters by tenantId", async () => {
    await repo.save(makeDriver("d1", "t1"));
    await repo.save(makeDriver("d2", "t2"));
    expect(await repo.findAll({ tenantId: "t1" })).toHaveLength(1);
  });

  it("findAll filters by status", async () => {
    await repo.save(makeDriver("d1", "t1", { status: "available" }));
    await repo.save(makeDriver("d2", "t1", { status: "offline" }));
    expect(await repo.findAll({ status: "offline" })).toHaveLength(1);
  });

  it("findAll filters by assigned", async () => {
    await repo.save(makeDriver("d1", "t1", { assignedVehicleId: "v1" }));
    await repo.save(makeDriver("d2", "t1"));
    expect(await repo.findAll({ assigned: true })).toHaveLength(1);
  });

  it("findByLicenseNumber is case insensitive and tenant-scoped", async () => {
    await repo.save(makeDriver("d1", "t1", { licenseNumber: "NG-001" }));
    expect(await repo.findByLicenseNumber("ng-001", "t1")).not.toBeNull();
    expect(await repo.findByLicenseNumber("NG-001", "t2")).toBeNull();
  });

  it("findByWhatsappNumber returns driver with matching number and tenant", async () => {
    await repo.save(makeDriver("d1", "t1", { contactChannels: { whatsappNumber: "+2348000000001", smsNumber: null, voiceNumber: null } }));
    expect(await repo.findByWhatsappNumber("+2348000000001", "t1")).not.toBeNull();
    expect(await repo.findByWhatsappNumber("+2348000000001", "t2")).toBeNull();
  });

  it("deleteById removes driver", async () => {
    await repo.save(makeDriver("d1"));
    await repo.deleteById("d1", "t1");
    expect(await repo.findById("d1", "t1")).toBeNull();
  });

  it("deleteById does not remove a driver belonging to a different tenant", async () => {
    await repo.save(makeDriver("d1", "t1"));
    await repo.deleteById("d1", "t2");
    expect(await repo.findById("d1", "t1")).not.toBeNull();
  });
});
