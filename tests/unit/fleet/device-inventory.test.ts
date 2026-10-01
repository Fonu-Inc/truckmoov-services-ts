import { describe, expect, it } from "vitest";
import {
  applyDeviceStatusFilter,
  summarizeDeviceStatuses,
  type DeviceInventoryRow,
} from "../../../apps/fleet/src/contexts/fleet/devices/domain/device-inventory";
import {
  buildDeviceCsvExport,
  buildDeviceCsvTemplate,
  parseDeviceCsv,
} from "../../../apps/fleet/src/contexts/fleet/devices/domain/device-csv";
import { buildQuotaAllowance } from "../../../apps/fleet/src/contexts/fleet/shared/domain/allowance";
import { Device } from "../../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";

function row(overrides: Partial<DeviceInventoryRow> = {}): DeviceInventoryRow {
  return {
    lifecycleStatus: "registered",
    vehicleId: null,
    provisionStatus: "registered",
    lastSeen: null,
    ...overrides,
  };
}

describe("Device status filters", () => {
  const inventory = [
    row({ lifecycleStatus: "assigned", vehicleId: "v1" }),
    row({ lifecycleStatus: "verified_online" }),
    row({ lifecycleStatus: "configured" }),
    row({ lifecycleStatus: "registered", provisionStatus: "failed" }),
  ];

  it("treats assigned and unassigned as a vehicle link, not a lifecycle state", () => {
    expect(applyDeviceStatusFilter(inventory, "assigned")).toHaveLength(1);
    expect(applyDeviceStatusFilter(inventory, "unassigned")).toHaveLength(3);
  });

  // A device the telemetry platform never accepted cannot report, whatever the
  // installer did to it, so unregistered is about provisioning and not about
  // the `registered` lifecycle state it shares a word with.
  it("reads unregistered from the provisioning outcome, not the lifecycle", () => {
    const unregistered = applyDeviceStatusFilter(inventory, "unregistered");
    expect(unregistered).toHaveLength(1);
    expect(unregistered[0].provisionStatus).toBe("failed");
    expect(applyDeviceStatusFilter(inventory, "registered")).toHaveLength(1);
  });

  it("counts active as the states that mean installed and reporting", () => {
    expect(applyDeviceStatusFilter(inventory, "active").map((r) => r.lifecycleStatus)).toEqual([
      "assigned",
      "verified_online",
    ]);
  });

  it("returns everything when no filter is chosen", () => {
    expect(applyDeviceStatusFilter(inventory, undefined)).toHaveLength(4);
  });
});

describe("Device status cards", () => {
  it("counts each card off the same predicate the filter uses", () => {
    const counts = summarizeDeviceStatuses([
      row({ lifecycleStatus: "assigned", vehicleId: "v1" }),
      row({ lifecycleStatus: "verified_online" }),
      row({ lifecycleStatus: "configured" }),
      row({ lifecycleStatus: "registered" }),
      row({ lifecycleStatus: "suspended" }),
    ]);

    expect(counts).toEqual({
      total: 5,
      active: 2,
      registered: 1,
      assigned: 1,
      unassigned: 4,
      configured: 1,
      suspended: 1,
    });
  });
});

describe("Device allowance", () => {
  it("reports the 9 / 10 bar", () => {
    expect(buildQuotaAllowance(10, 9)).toEqual({
      limit: 10,
      used: 9,
      remaining: 1,
      usedPercent: 90,
      unlimited: false,
    });
  });

  it("reports an unlimited plan as unlimited rather than full", () => {
    expect(buildQuotaAllowance(null, 40)).toMatchObject({
      remaining: null,
      usedPercent: null,
      unlimited: true,
    });
  });

  it("never reports negative headroom", () => {
    expect(buildQuotaAllowance(5, 8).remaining).toBe(0);
  });
});

describe("Device CSV", () => {
  it("round trips an export back through the parser", () => {
    const csv = buildDeviceCsvExport([
      {
        imei: "359779090012345",
        name: "Truck 12 — Tracker",
        manufacturer: "Teltonika",
        model: "FMC130",
        firmwareVersion: "1.0.0",
        lifecycleStatus: "registered",
      },
    ]);

    const parsed = parseDeviceCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({
      imei: "359779090012345",
      name: "Truck 12 — Tracker",
      manufacturer: "Teltonika",
    });
  });

  it("parses the downloadable template's example row", () => {
    const parsed = parseDeviceCsv(buildDeviceCsvTemplate());
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
  });

  it("rejects a malformed IMEI on the row rather than the whole file", () => {
    const parsed = parseDeviceCsv(
      [
        "imei,manufacturer,model",
        "359779090012345,Teltonika,FMC130",
        "12345,Teltonika,FMC130",
      ].join("\n"),
    );

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors).toEqual([{ line: 3, message: "imei must be exactly 15 digits" }]);
  });

  // Two rows for one IMEI would import as a create then an update, so the
  // created count would not match what the operator sent.
  it("refuses a repeated IMEI within one file", () => {
    const parsed = parseDeviceCsv(
      [
        "imei,manufacturer,model",
        "359779090012345,Teltonika,FMC130",
        "359779090012345,Teltonika,FMC130",
      ].join("\n"),
    );

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.errors[0].message).toMatch(/more than once/);
  });

  // A spreadsheet reads a leading = as a formula. The guard has to survive the
  // round trip or an export stops importing cleanly.
  it("neutralises a formula on export and strips it back on import", () => {
    const csv = buildDeviceCsvExport([
      {
        imei: "359779090012345",
        name: "=cmd|calc",
        manufacturer: "Teltonika",
        model: "FMC130",
        firmwareVersion: null,
        lifecycleStatus: null,
      },
    ]);

    expect(csv).toContain("'=cmd|calc");
    expect(parseDeviceCsv(csv).rows[0].name).toBe("=cmd|calc");
  });

  it("refuses a lifecycle state an operator cannot claim from a spreadsheet", () => {
    const parsed = parseDeviceCsv(
      ["imei,manufacturer,model,lifecycle_status", "359779090012345,Teltonika,FMC130,assigned"].join("\n"),
    );
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.errors[0].message).toMatch(/lifecycle_status must be one of/);
  });

  it("throws when a required column is absent, because no row can be trusted", () => {
    expect(() => parseDeviceCsv("imei,model\n359779090012345,FMC130")).toThrow(/manufacturer/);
  });
});

function device(lifecycleStatus: Parameters<typeof Device.create>[0]["lifecycleStatus"], vehicleId: string | null = null) {
  return Device.create({
    id: "d1",
    imei: "359779090012345",
    manufacturer: "Teltonika",
    model: "FMC130",
    firmwareVersion: "1.0.0",
    tenantId: "tenant-a",
    lifecycleStatus,
    vehicleId,
    signalStrength: null,
    batteryLevel: null,
    lastSeen: null,
    assignedAt: null,
  });
}

describe("Device suspension", () => {


  it("releases the vehicle and remembers where the device was", () => {
    const suspended = device("assigned", "v1").suspend("Unpaid invoice");

    expect(suspended.lifecycleStatus).toBe("suspended");
    expect(suspended.vehicleId).toBeNull();
    expect(suspended.suspensionReason).toBe("Unpaid invoice");
    expect(suspended.preSuspensionLifecycleStatus).toBe("assigned");
  });

  // The vehicle link was released on suspension and may since have been taken
  // by another device, so a reinstated device comes back ready to assign.
  it("reinstates an assigned device as assignable, not assigned", () => {
    const reinstated = device("assigned", "v1").suspend(null).reinstate();

    expect(reinstated.lifecycleStatus).toBe("assignable");
    expect(reinstated.suspendedAt).toBeNull();
    expect(reinstated.preSuspensionLifecycleStatus).toBeNull();
  });

  it("puts a half-installed device back where it was", () => {
    expect(device("configured").suspend(null).reinstate().lifecycleStatus).toBe("configured");
  });

  it("refuses to suspend twice, or to suspend a decommissioned device", () => {
    expect(() => device("configured").suspend(null).suspend(null)).toThrow(/already suspended/);
    expect(() => device("decommissioned").suspend(null)).toThrow(/decommissioned/);
    expect(() => device("configured").reinstate()).toThrow(/not suspended/);
  });
});

describe("who may lift a suspension", () => {
  it("lets a tenant reinstate a device it suspended", () => {
    const suspended = device("assignable").suspend("lost", "tenant");

    expect(suspended.suspendedBy).toBe("tenant");
    const reinstated = suspended.reinstate("tenant");
    expect(reinstated.lifecycleStatus).toBe("assignable");
    expect(reinstated.suspendedBy).toBeNull();
  });

  // A platform suspension (say, for non-payment) is not the tenant's to undo.
  it("refuses a tenant reinstating a platform suspension", () => {
    expect(() => device("assignable").suspend(null, "platform").reinstate("tenant")).toThrow(/only the platform/);
  });

  it("treats a suspension with no recorded suspender as the platform's", () => {
    const legacy = Device.create({ ...device("assignable").suspend(null).toPrimitives(), suspendedBy: null });

    expect(() => legacy.reinstate("tenant")).toThrow(/only the platform/);
    expect(legacy.reinstate("platform").lifecycleStatus).toBe("assignable");
  });

  it("lets the platform lift a tenant's suspension", () => {
    expect(device("assignable").suspend(null, "tenant").reinstate().lifecycleStatus).toBe("assignable");
  });
});

describe("a suspended device rebuilt by another change", () => {
  // Any entity change rebuilds the device from its primitives; losing these
  // would forget where to reinstate it and who may.
  it("keeps where it was and who suspended it", () => {
    const rebuilt = device("configured").suspend("lost", "tenant").withProvisioning({ provisionStatus: "registered" });

    expect(rebuilt).toMatchObject({ suspendedBy: "tenant", suspensionReason: "lost", preSuspensionLifecycleStatus: "configured" });
    expect(rebuilt.reinstate("tenant").lifecycleStatus).toBe("configured");
  });
});
