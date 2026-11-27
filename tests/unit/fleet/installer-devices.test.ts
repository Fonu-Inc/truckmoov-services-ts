import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { Device } from "../../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";
import { InMemoryDeviceRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device.repository";
import { InMemoryDeviceVerificationFailureRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device-verification-failure.repository";
import { GetVerificationMonitorUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/get-verification-monitor.use-case";
import { GetDeviceDiagnosticsUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/get-device-diagnostics.use-case";
import { GetInstallationQueueUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/get-installation-queue.use-case";
import { InstallerDevicesUseCases } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/installer-devices.use-cases";
import type { DeviceCatalogModel } from "../../../apps/fleet/src/contexts/fleet/devices/domain/ports/device-catalog.port";
import type { InstallerScopeEntry } from "../../../apps/fleet/src/contexts/fleet/devices/domain/ports/installer-device-scope.port";
import { InstallerDevicesController } from "../../../apps/fleet/src/installer-devices.controller";
import { InternalFleetController } from "../../../apps/fleet/src/internal-fleet.controller";

const NOW = new Date("2026-09-24T10:00:00Z");
const LAGOS_MIDNIGHT = "2026-09-23T23:00:00.000Z";
const JUST_BEFORE = "2026-09-23T22:59:59.000Z";

const MODELS: DeviceCatalogModel[] = [
  {
    manufacturer: "Teltonika",
    model: "FMB920",
    deviceType: "GPS Tracker",
    protocol: "TCP",
    defaultPort: 5027,
    status: "supported",
    configurationInstructions: null,
    smsCommands: [],
    wiringNotes: null,
    diagramUrls: [],
  },
  {
    manufacturer: "Coban",
    model: "TK303G",
    deviceType: "GPS Tracker",
    protocol: "SDK",
    defaultPort: 443,
    status: "supported",
    configurationInstructions: null,
    smsCommands: [],
    wiringNotes: null,
    diagramUrls: [],
  },
];

const catalog = {
  findAll: async () => MODELS,
  findModel: async (manufacturer: string, model: string) =>
    MODELS.find((entry) => entry.manufacturer === manufacturer && entry.model === model) ?? null,
};

let imei = 359779090012300;

function device(id: string, tenantId: string, overrides: Partial<Parameters<typeof Device.create>[0]> = {}) {
  imei += 1;
  return Device.create({
    id,
    imei: String(imei),
    manufacturer: "Teltonika",
    model: "FMB920",
    firmwareVersion: "3.28.07",
    tenantId,
    lifecycleStatus: "configured",
    vehicleId: null,
    signalStrength: null,
    batteryLevel: null,
    lastSeen: null,
    assignedAt: null,
    ...overrides,
  });
}

function entry(deviceId: string, tenantId: string, jobNumber = "FL-1000"): InstallerScopeEntry {
  return { tenantId, orderId: `order-${jobNumber}`, jobNumber, deviceId };
}

function harness(ingestHost = "ingest.truckmoov.io") {
  const devices = new InMemoryDeviceRepository();
  const failures = new InMemoryDeviceVerificationFailureRepository();
  const monitor = new GetVerificationMonitorUseCase(devices, failures);
  const config = { fleet: { telemetryIngestHost: ingestHost } } as never;
  const useCases = new InstallerDevicesUseCases(monitor, new GetDeviceDiagnosticsUseCase(devices, failures), catalog, config);
  return { devices, failures, useCases };
}

function controllerWith(useCases: InstallerDevicesUseCases, scope: InstallerScopeEntry[] | null) {
  const port = { forUser: vi.fn(async () => scope) };
  const controller = new InstallerDevicesController({} as never, {} as never, useCases, port);
  return { controller, port, req: { user: { userId: "user-ada", tenantId: "system" } } };
}

describe("installer verification tab", () => {
  it("reads each device in its job's tenant, two tenants in one scope", async () => {
    const kit = harness();
    await kit.devices.save(device("a1", "tenant-a", { name: "Truck 1", verificationStatus: "waiting", configuredAt: "2026-09-24T09:58:00.000Z" }));
    await kit.devices.save(device("b1", "tenant-b"));
    await kit.devices.save(device("elsewhere", "tenant-c"));
    const findScoped = vi.spyOn(kit.devices, "findScoped");

    const { items } = await kit.useCases.verification(
      [entry("a1", "tenant-a", "FL-1001"), entry("b1", "tenant-b", "FL-1002"), entry("elsewhere", "tenant-a", "FL-1001")],
      NOW,
    );

    expect(findScoped).toHaveBeenCalledTimes(1);
    expect(items.map((item) => [item.deviceId, item.jobNumber])).toEqual([["a1", "FL-1001"], ["b1", "FL-1002"]]);
    expect(items[0]).toMatchObject({
      name: "Truck 1",
      manufacturer: "Teltonika",
      model: "FMB920",
      status: "waiting",
      statusLabel: "Waiting",
      secondsSinceConfigured: 120,
      lastSeenAt: null,
      errors: [],
    });
    expect(items[1]).toMatchObject({ status: "not_started", configuredAt: null, secondsSinceConfigured: null });
  });

  it("never returns a device outside the tenant its scope entry names", async () => {
    const kit = harness();
    await kit.devices.save(device("a1", "tenant-a"));
    await kit.devices.save(device("b1", "tenant-b"));

    const { items } = await kit.useCases.verification([entry("a1", "tenant-a"), entry("b1", "tenant-a")], NOW);

    expect(items.map((item) => item.deviceId)).toEqual(["a1"]);
  });

  it("counts awaiting, failed and verified today from Lagos midnight", async () => {
    const kit = harness();
    await kit.devices.save(device("w", "tenant-a", { verificationStatus: "waiting" }));
    await kit.devices.save(device("f", "tenant-a", { verificationStatus: "failed" }));
    await kit.devices.save(device("today", "tenant-b", { verificationStatus: "verified", verifiedAt: LAGOS_MIDNIGHT }));
    await kit.devices.save(device("yesterday", "tenant-b", { verificationStatus: "verified", verifiedAt: JUST_BEFORE }));
    await kit.failures.append({
      id: "fail-1", tenantId: "tenant-a", deviceId: "f", imei: "x", reason: "wrong_port", detail: null,
      rawPayload: null, sourceAddress: null, createdAt: "2026-09-24T09:00:00.000Z",
    });

    const result = await kit.useCases.verification(
      [entry("w", "tenant-a"), entry("f", "tenant-a"), entry("today", "tenant-b"), entry("yesterday", "tenant-b")],
      NOW,
    );

    expect(result.summary).toEqual({ awaitingSignal: 1, failed: 1, verifiedToday: 1 });
    expect(result.items.find((item) => item.deviceId === "f")?.errors).toEqual([
      { code: "wrong_port", message: "The device reported on the wrong port" },
    ]);
  });

  it("answers 503 when auth cannot say what the installer's devices are", async () => {
    const { controller, req } = controllerWith(harness().useCases, null);
    await expect(controller.verification(req)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe("installer troubleshooting tab", () => {
  it("shows the expected endpoint from the catalogue mapping", async () => {
    const kit = harness();
    await kit.devices.save(device("a1", "tenant-a", { lastSeen: "2026-09-24T09:00:00.000Z" }));
    const { controller, req } = controllerWith(kit.useCases, [entry("a1", "tenant-a")]);

    const { data } = await controller.diagnostics("a1", req);

    expect(data).toMatchObject({
      device: { id: "a1", manufacturer: "Teltonika", model: "FMB920", jobNumber: "FL-1000" },
      status: "configured",
      statusLabel: "Configured",
      lastSeenAt: "2026-09-24T09:00:00.000Z",
      errors: [],
      expectedEndpoint: { host: "ingest.truckmoov.io", protocol: "TCP", port: 5027 },
    });
  });

  it("leaves protocol and port null for a model the catalogue does not map", async () => {
    const kit = harness("");
    await kit.devices.save(device("u1", "tenant-a", { manufacturer: "Unbranded", model: "X1" }));
    await kit.devices.save(device("s1", "tenant-a", { manufacturer: "Coban", model: "TK303G" }));
    const scope = [entry("u1", "tenant-a"), entry("s1", "tenant-a")];

    expect((await kit.useCases.diagnose(scope, "u1")).expectedEndpoint).toEqual({ host: null, protocol: null, port: null });
    expect((await kit.useCases.diagnose(scope, "s1")).expectedEndpoint).toEqual({ host: null, protocol: "SDK", port: null });
  });

  it("answers a device outside the scope exactly like a missing one", async () => {
    const kit = harness();
    await kit.devices.save(device("theirs", "tenant-b"));
    await kit.devices.save(device("mine", "tenant-a"));
    const { controller, req } = controllerWith(kit.useCases, [entry("mine", "tenant-a"), entry("gone", "tenant-a")]);

    const outside = controller.diagnostics("theirs", req).catch((error: Error) => error);
    const missing = controller.diagnostics("gone", req).catch((error: Error) => error);
    const [a, b] = await Promise.all([outside, missing]);

    expect(a).toBeInstanceOf(NotFoundException);
    expect(b).toBeInstanceOf(NotFoundException);
    expect((a as Error).message.replace("theirs", "ID")).toBe((b as Error).message.replace("gone", "ID"));
  });
});

describe("tenant installation queue", () => {
  it("counts verified today from Lagos midnight, not UTC", async () => {
    const devices = new InMemoryDeviceRepository();
    await devices.save(device("today", "tenant-a", { verificationStatus: "verified", verifiedAt: LAGOS_MIDNIGHT }));
    await devices.save(device("yesterday", "tenant-a", { verificationStatus: "verified", verifiedAt: JUST_BEFORE }));

    const { summary } = await new GetInstallationQueueUseCase(devices).execute("tenant-a", NOW);

    expect(summary.verifiedToday).toBe(1);
  });
});

describe("devices by id for auth's job details", () => {
  it("carries the catalogue device type, null when the model is not catalogued", async () => {
    const devices = new InMemoryDeviceRepository();
    await devices.save(device("known", "tenant-a"));
    await devices.save(device("unknown", "tenant-a", { manufacturer: "Unbranded", model: "X1" }));
    const controller = new InternalFleetController({} as never, {} as never, {} as never, {} as never, devices, {} as never, {} as never, catalog);

    const result = (await controller.tenantDevices("tenant-a", "known,unknown")) as { data: { items: Array<{ id: string; deviceType: string | null }> } };

    expect(result.data.items.map((item) => [item.id, item.deviceType])).toEqual([["known", "GPS Tracker"], ["unknown", null]]);
  });

  it("carries each device's verification status", async () => {
    const devices = new InMemoryDeviceRepository();
    await devices.save(device("known", "tenant-a", { verificationStatus: "verified", verifiedAt: NOW.toISOString() }));
    const controller = new InternalFleetController({} as never, {} as never, {} as never, {} as never, devices, {} as never, {} as never, catalog);

    const result = (await controller.tenantDevices("tenant-a", "known")) as { data: { items: Array<{ verificationStatus: string | null }> } };

    expect(result.data.items[0].verificationStatus).toBe("verified");
  });
});

describe("connectivity for a job's devices", () => {
  it("checks only the named devices when deviceIds is given", async () => {
    const devices = new InMemoryDeviceRepository();
    for (const id of ["job-1", "job-2", "other"]) await devices.save(device(id, "tenant-a"));
    await devices.save(device("elsewhere", "tenant-b"));
    const controller = new InternalFleetController({} as never, {} as never, {} as never, {} as never, devices, {} as never, {} as never, catalog);

    const scoped = await controller.tenantConnectivity("tenant-a", "job-1,job-2,elsewhere");
    const all = await controller.tenantConnectivity("tenant-a");

    expect(scoped.data.items.map((item) => item.deviceId).sort()).toEqual(["job-1", "job-2"]);
    expect(scoped.data.total).toBe(2);
    expect(all.data.total).toBe(3);
  });
});
