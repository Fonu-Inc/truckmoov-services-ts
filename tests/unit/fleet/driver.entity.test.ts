import { describe, expect, it } from "vitest";
import { Driver } from "../../../apps/fleet/src/contexts/fleet/drivers/domain/entities/driver.entity";

function makeDriver(overrides: Partial<Parameters<typeof Driver.create>[0]> = {}) {
  return Driver.create({
    id: "d1",
    name: "John Doe",
    licenseNumber: "NG-12345",
    tenantId: "tenant-1",
    status: "active",
    assignedVehicleId: null,
    contactChannels: { whatsappNumber: null, smsNumber: null, voiceNumber: null },
    ...overrides,
  });
}

describe("Driver entity", () => {
  it("normalizes licenseNumber to uppercase", () => {
    expect(makeDriver({ licenseNumber: "ng-12345" }).licenseNumber).toBe("NG-12345");
  });

  it("trims name and tenantId", () => {
    const d = makeDriver({ name: "  Jane  ", tenantId: "  t1  " });
    expect(d.name).toBe("Jane");
    expect(d.tenantId).toBe("t1");
  });

  it("throws for empty name", () => {
    expect(() => makeDriver({ name: "" })).toThrow("name is required");
  });

  it("throws for empty licenseNumber", () => {
    expect(() => makeDriver({ licenseNumber: "  " })).toThrow("licenseNumber is required");
  });

  it("throws for invalid status", () => {
    expect(() => makeDriver({ status: "suspended" as any })).toThrow("status must be one of");
  });

  it("assignVehicle returns new instance", () => {
    const d = makeDriver();
    expect(d.assignVehicle("v1").assignedVehicleId).toBe("v1");
    expect(d.assignedVehicleId).toBeNull();
  });

  it("unassignVehicle clears vehicleId", () => {
    expect(makeDriver().assignVehicle("v1").unassignVehicle().assignedVehicleId).toBeNull();
  });

  it("setStatus inactive clears assignedVehicleId", () => {
    expect(makeDriver().assignVehicle("v1").setStatus("inactive").assignedVehicleId).toBeNull();
  });

  it("updateContactChannels merges channels", () => {
    const d = makeDriver().updateContactChannels({ whatsappNumber: "+2348000000000" });
    expect(d.contactChannels.whatsappNumber).toBe("+2348000000000");
    expect(d.contactChannels.smsNumber).toBeNull();
  });

  it("toPrimitives returns plain object", () => {
    expect(makeDriver().toPrimitives().id).toBe("d1");
  });
});
