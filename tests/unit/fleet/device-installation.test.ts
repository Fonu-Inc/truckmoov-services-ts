import { describe, expect, it } from "vitest";
import { Device } from "../../../apps/fleet/src/contexts/fleet/devices/domain/entities/device.entity";
import { InMemoryDeviceRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device.repository";
import { InMemoryDeviceVerificationFailureRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device-verification-failure.repository";
import { ConfigureDeviceUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/configure-device.use-case";
import { BulkConfigureDevicesUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/bulk-configure-devices.use-case";
import { StartDeviceVerificationUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/start-device-verification.use-case";
import { RecordDeviceTelemetryUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/record-device-telemetry.use-case";
import { RecordVerificationFailureUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/record-verification-failure.use-case";
import { ExpireDeviceVerificationsUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/expire-device-verifications.use-case";
import { GetInstallationQueueUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/get-installation-queue.use-case";
import { GetVerificationMonitorUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/get-verification-monitor.use-case";
import { GetInstallerGuideUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/get-installer-guide.use-case";
import { GetDeviceDiagnosticsUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/get-device-diagnostics.use-case";
import type { DeviceCatalogModel } from "../../../apps/fleet/src/contexts/fleet/devices/domain/ports/device-catalog.port";

const TENANT = "tenant-1";

const TELTONIKA: DeviceCatalogModel = {
  manufacturer: "Teltonika",
  model: "FMB920",
  deviceType: "GPS Tracker",
  protocol: "TCP",
  defaultPort: 5001,
  status: "supported",
  configurationInstructions: "Send the setup SMS, then power cycle.",
  smsCommands: ["setparam 2004:tracker.truckmoov.io"],
  wiringNotes: "Red to permanent 12V, black to chassis ground.",
  diagramUrls: ["https://cdn.truckmoov.io/fmb920.png"],
};

const SDK_MODEL: DeviceCatalogModel = {
  ...TELTONIKA,
  model: "SDK-ONLY",
  protocol: "SDK",
  defaultPort: null,
};

class FakeCatalog {
  constructor(private readonly models: DeviceCatalogModel[] = [TELTONIKA, SDK_MODEL]) {}

  async findModel(manufacturer: string, model: string) {
    return (
      this.models.find(
        (entry) =>
          entry.manufacturer.toLowerCase() === manufacturer.toLowerCase()
          && entry.model.toLowerCase() === model.toLowerCase(),
      ) ?? null
    );
  }

  async findAll() {
    return this.models;
  }
}

let failureCounter = 0;
const runtime = {
  generateId: () => `fail-${failureCounter++}`,
  getDefaultTenantId: () => TENANT,
};

function configFor(windowMinutes = 30) {
  return {
    fleet: {
      deviceVerificationWindowMinutes: windowMinutes,
      telemetryIngestHost: "tracker.truckmoov.io",
    },
  } as never;
}

function makeDevice(overrides: Partial<Parameters<typeof Device.create>[0]> = {}) {
  return Device.create({
    id: "dev-1",
    imei: "359779090012345",
    manufacturer: "Teltonika",
    model: "FMB920",
    firmwareVersion: "3.28.07",
    tenantId: TENANT,
    lifecycleStatus: "registered",
    vehicleId: null,
    signalStrength: null,
    batteryLevel: null,
    lastSeen: null,
    assignedAt: null,
    ...overrides,
  });
}

function harness() {
  const devices = new InMemoryDeviceRepository();
  const failures = new InMemoryDeviceVerificationFailureRepository();
  const catalog = new FakeCatalog();
  const configure = new ConfigureDeviceUseCase(devices, catalog as never);
  const recordFailure = new RecordVerificationFailureUseCase(
    devices,
    failures,
    runtime as never,
  );

  return {
    devices,
    failures,
    configure,
    recordFailure,
    bulkConfigure: new BulkConfigureDevicesUseCase(configure),
    startVerification: new StartDeviceVerificationUseCase(devices, configFor()),
    telemetry: new RecordDeviceTelemetryUseCase(devices),
    expire: new ExpireDeviceVerificationsUseCase(devices, recordFailure),
    queue: new GetInstallationQueueUseCase(devices),
    monitor: new GetVerificationMonitorUseCase(devices, failures),
    guides: new GetInstallerGuideUseCase(catalog as never, configFor()),
    diagnostics: new GetDeviceDiagnosticsUseCase(devices, failures),
  };
}

describe("Device installation", () => {
  it("takes protocol and port from the catalogue, not the caller", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice());

    const configured = await kit.configure.execute({ tenantId: TENANT, deviceId: "dev-1" });

    expect(configured.protocol).toBe("TCP");
    expect(configured.port).toBe(5001);
    expect(configured.lifecycleStatus).toBe("configured");
  });

  it("records when the device was configured", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice());

    const configured = await kit.configure.execute({ tenantId: TENANT, deviceId: "dev-1" });

    // The screen shows "Unknown" when this is null, which was the bug.
    expect(configured.configuredAt).not.toBeNull();
    expect(Number.isNaN(Date.parse(configured.configuredAt ?? ""))).toBe(false);
  });

  it("drops the port for a protocol that has none", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice({ model: "SDK-ONLY" }));

    const configured = await kit.configure.execute({ tenantId: TENANT, deviceId: "dev-1" });

    expect(configured.protocol).toBe("SDK");
    expect(configured.port).toBeNull();
  });

  it("refuses a model the catalogue does not hold", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice({ manufacturer: "Unbranded", model: "X1" }));

    await expect(() =>
      kit.configure.execute({ tenantId: TENANT, deviceId: "dev-1" }),
    ).rejects.toThrow("not in the device catalogue");
  });

  it("verifies only when the device itself reports", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice());
    await kit.configure.execute({ tenantId: TENANT, deviceId: "dev-1" });
    const waiting = await kit.startVerification.execute({ tenantId: TENANT, deviceId: "dev-1" });

    expect(waiting.verificationStatus).toBe("waiting");
    expect(waiting.lifecycleStatus).toBe("configured");

    const reportedAt = "2026-08-25T10:00:00.000Z";
    const verified = await kit.telemetry.execute({
      tenantId: TENANT,
      deviceId: "dev-1",
      imei: null,
      reportedAt,
    });

    expect(verified?.verificationStatus).toBe("verified");
    expect(verified?.lifecycleStatus).toBe("verified_online");
    expect(verified?.verifiedAt).toBe(reportedAt);
    expect(verified?.lastSeen).toBe(reportedAt);
  });

  it("matches telemetry by imei when the device id is the imei", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice());
    await kit.configure.execute({ tenantId: TENANT, deviceId: "dev-1" });
    await kit.startVerification.execute({ tenantId: TENANT, deviceId: "dev-1" });

    const verified = await kit.telemetry.execute({
      tenantId: TENANT,
      deviceId: "359779090012345",
      imei: "359779090012345",
      reportedAt: "2026-08-25T10:00:00.000Z",
    });

    expect(verified?.id).toBe("dev-1");
    expect(verified?.verificationStatus).toBe("verified");
  });

  it("fails an attempt whose window closed, and keeps the device configured", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice());
    await kit.configure.execute({ tenantId: TENANT, deviceId: "dev-1" });
    await kit.startVerification.execute({ tenantId: TENANT, deviceId: "dev-1" });

    const wellPastDeadline = new Date(Date.now() + 60 * 60_000);
    const result = await kit.expire.execute(wellPastDeadline);

    expect(result.expired).toBe(1);

    const device = await kit.devices.findById("dev-1", TENANT);
    expect(device?.verificationStatus).toBe("failed");
    expect(device?.lifecycleStatus).toBe("configured");

    const logged = await kit.failures.findByDevice("dev-1", TENANT, 10);
    expect(logged[0]?.reason).toBe("timeout");
  });

  it("does not expire a window that is still open", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice());
    await kit.configure.execute({ tenantId: TENANT, deviceId: "dev-1" });
    await kit.startVerification.execute({ tenantId: TENANT, deviceId: "dev-1" });

    expect((await kit.expire.execute(new Date())).expired).toBe(0);
  });

  it("keeps the raw payload of a device nothing can parse", async () => {
    const kit = harness();
    const device = makeDevice();
    await kit.devices.save(device);

    await kit.recordFailure.execute({
      device,
      reason: "malformed_payload",
      detail: "no known framing",
      rawPayload: "\\x00\\xff garbage bytes",
      sourceAddress: "197.210.0.1",
    });

    const logged = await kit.failures.findByDevice(device.id, TENANT, 10);
    expect(logged[0]?.rawPayload).toBe("\\x00\\xff garbage bytes");
    expect(logged[0]?.sourceAddress).toBe("197.210.0.1");
  });

  it("lets a failed device be configured again", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice());
    await kit.configure.execute({ tenantId: TENANT, deviceId: "dev-1" });
    await kit.startVerification.execute({ tenantId: TENANT, deviceId: "dev-1" });
    await kit.expire.execute(new Date(Date.now() + 60 * 60_000));

    const reconfigured = await kit.configure.execute({
      tenantId: TENANT,
      deviceId: "dev-1",
      port: 5005,
    });

    expect(reconfigured.port).toBe(5005);
    // A new attempt starts clean: the old outcome says nothing about the
    // settings now on the device.
    expect(reconfigured.verificationStatus).toBeNull();
    expect(reconfigured.verificationError).toBeNull();
  });

  it("derives the next action from the state", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice());

    const pending = await kit.queue.execute(TENANT);
    expect(pending.queue[0]?.nextActionLabel).toBe("Setup Guide");

    await kit.configure.execute({ tenantId: TENANT, deviceId: "dev-1" });
    expect((await kit.queue.execute(TENANT)).queue[0]?.nextActionLabel).toBe("Verify Signal");

    await kit.startVerification.execute({ tenantId: TENANT, deviceId: "dev-1" });
    await kit.telemetry.execute({
      tenantId: TENANT,
      deviceId: "dev-1",
      imei: null,
      reportedAt: new Date().toISOString(),
    });
    expect((await kit.queue.execute(TENANT)).queue[0]?.nextActionLabel).toBe("Ready to Assign");
  });

  it("sends a failed device back to the setup guide", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice());
    await kit.configure.execute({ tenantId: TENANT, deviceId: "dev-1" });
    await kit.startVerification.execute({ tenantId: TENANT, deviceId: "dev-1" });
    await kit.expire.execute(new Date(Date.now() + 60 * 60_000));

    expect((await kit.queue.execute(TENANT)).queue[0]?.nextActionLabel).toBe("Setup Guide");
  });

  it("counts awaiting, failed and verified today", async () => {
    const kit = harness();
    const now = new Date("2026-08-25T12:00:00.000Z");
    await kit.devices.save(makeDevice({ id: "dev-1", imei: "359779090012341" }));
    await kit.devices.save(makeDevice({ id: "dev-2", imei: "359779090012342" }));
    await kit.devices.save(makeDevice({ id: "dev-3", imei: "359779090012343" }));

    for (const id of ["dev-1", "dev-2", "dev-3"]) {
      await kit.configure.execute({ tenantId: TENANT, deviceId: id });
      await kit.startVerification.execute({ tenantId: TENANT, deviceId: id });
    }

    await kit.telemetry.execute({
      tenantId: TENANT,
      deviceId: "dev-1",
      imei: null,
      reportedAt: "2026-08-25T09:00:00.000Z",
    });
    const failing = await kit.devices.findById("dev-2", TENANT);
    await kit.recordFailure.execute({ device: failing!, reason: "wrong_port" });

    const { summary } = await kit.queue.execute(TENANT, now);
    expect(summary).toEqual({
      awaitingSignal: 1,
      failedVerification: 1,
      verifiedToday: 1,
    });
  });

  it("reports time since configured, and null when it was never recorded", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice());
    const configured = await kit.configure.execute({ tenantId: TENANT, deviceId: "dev-1" });
    await kit.startVerification.execute({ tenantId: TENANT, deviceId: "dev-1" });

    const later = new Date(Date.parse(configured.configuredAt ?? "") + 90_000);
    const [row] = await kit.monitor.execute(TENANT, later);
    expect(row?.secondsSinceConfigured).toBe(90);

    // A device that predates the column has no configured-at, and the screen
    // must tell that apart from "no time has passed".
    await kit.devices.save(
      makeDevice({
        id: "dev-9",
        imei: "359779090012349",
        lifecycleStatus: "configured",
        verificationStatus: "waiting",
        verificationDeadline: later.toISOString(),
        configuredAt: null,
      }),
    );

    const rows = await kit.monitor.execute(TENANT, later);
    expect(rows.find((entry) => entry.id === "dev-9")?.secondsSinceConfigured).toBeNull();
  });

  it("joins the ingest address to the catalogue instructions", async () => {
    const kit = harness();
    const guide = await kit.guides.execute("Teltonika", "FMB920");

    expect(guide.configuration.serverAddress).toBe("tracker.truckmoov.io");
    expect(guide.configuration.protocol).toBe("TCP");
    expect(guide.configuration.port).toBe(5001);
    expect(guide.configuration.smsCommands).toEqual(["setparam 2004:tracker.truckmoov.io"]);
    expect(guide.wiringNotes).toContain("chassis ground");
    expect(guide.diagramUrls).toHaveLength(1);
  });

  it("configures a batch and reports the ones that did not take", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice({ id: "dev-1", imei: "359779090012341" }));
    await kit.devices.save(makeDevice({ id: "dev-2", imei: "359779090012342" }));
    await kit.devices.save(
      makeDevice({
        id: "dev-3",
        imei: "359779090012343",
        manufacturer: "Unbranded",
        model: "X1",
      }),
    );

    const result = await kit.bulkConfigure.execute({
      tenantId: TENANT,
      deviceIds: ["dev-1", "dev-2", "dev-3"],
    });

    expect(result.configured).toEqual(["dev-1", "dev-2"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.deviceId).toBe("dev-3");
  });

  it("diagnostics show configured and reported protocol side by side", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice());
    await kit.configure.execute({ tenantId: TENANT, deviceId: "dev-1" });
    await kit.startVerification.execute({ tenantId: TENANT, deviceId: "dev-1" });
    await kit.telemetry.execute({
      tenantId: TENANT,
      deviceId: "dev-1",
      imei: null,
      reportedAt: "2026-08-25T10:00:00.000Z",
      reportedProtocol: "teltonika",
    });

    const diagnostics = await kit.diagnostics.execute("dev-1", TENANT);

    expect(diagnostics.configuredWith).toEqual({ protocol: "TCP", port: 5001 });
    expect(diagnostics.reportedWith).toEqual({ protocol: "teltonika" });
  });

  it("diagnostics show a null reported protocol before the device has ever spoken", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice());
    await kit.configure.execute({ tenantId: TENANT, deviceId: "dev-1" });

    const diagnostics = await kit.diagnostics.execute("dev-1", TENANT);

    expect(diagnostics.reportedWith).toEqual({ protocol: null });
  });

  it("does not verify a device that was never configured", async () => {
    const kit = harness();
    await kit.devices.save(makeDevice());

    await expect(() =>
      kit.startVerification.execute({ tenantId: TENANT, deviceId: "dev-1" }),
    ).rejects.toThrow("only a configured device can be verified");
  });
});
