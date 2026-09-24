import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { PROPERTY_DEPS_METADATA } from "@nestjs/common/constants";
import { AppConfigService } from "@shared/config";
import { DeviceSetupRequestsController } from "../../../apps/fleet/src/device-setup-requests.controller";
import { InMemoryDeviceSetupRequestRepository } from "../../../apps/fleet/src/contexts/fleet/device-setup-requests/infrastructure/repositories/in-memory-device-setup-request.repository";
import { CreateDeviceSetupRequestUseCase } from "../../../apps/fleet/src/contexts/fleet/device-setup-requests/application/use-cases/create-device-setup-request.use-case";
import type { FleetRequestContext } from "../../../apps/fleet/src/base.controller";

const runtime = { generateId: () => "req-1", getDefaultTenantId: () => "t1" } as never;
const payload = { manufacturer: "Teltonika", trackerType: "hardwired", useCase: "Long-haul GPS tracking" } as never;

function harness(trustedProxies: string[] = []) {
  const repository = new InMemoryDeviceSetupRequestRepository();
  const auditLog = { record: vi.fn().mockResolvedValue(undefined) };
  const bus = { publish: vi.fn().mockResolvedValue(undefined) };
  const controller = new DeviceSetupRequestsController(
    auditLog as never,
    bus as never,
    new CreateDeviceSetupRequestUseCase(repository, runtime),
    {} as never,
    {} as never,
    {} as never,
  );
  Object.assign(controller, { appConfig: { audit: { trustedProxies, clientIpHeader: "x-forwarded-for" } } });
  return { controller, repository, auditLog, bus };
}

function request(overrides: Partial<FleetRequestContext> = {}): FleetRequestContext {
  return {
    user: { tenantId: "t1", userId: "user-1", role: "FLEET_ADMIN", email: "ops@acme.ng" },
    headers: {},
    socket: { remoteAddress: "::ffff:41.58.1.2" },
    ...overrides,
  };
}

describe("device setup request caller", () => {
  it("records the signed-in user and their email", async () => {
    const { controller, repository } = harness();

    await controller.createDeviceSetupRequest(payload, request());

    const stored = (await repository.findById("req-1", "t1"))!.toPrimitives();
    expect(stored.requestedByUserId).toBe("user-1");
    expect(stored.requestingEmail).toBe("ops@acme.ng");
  });

  it("keeps an email the tenant typed", async () => {
    const { controller, repository } = harness();

    await controller.createDeviceSetupRequest({ ...(payload as object), requestingEmail: " fleet@acme.ng " } as never, request());

    expect((await repository.findById("req-1", "t1"))!.toPrimitives().requestingEmail).toBe("fleet@acme.ng");
  });

  it("does not record a service principal as the requester", async () => {
    const { controller, repository } = harness();
    const service = { tenantId: "t1", userId: "service:auth", role: "FLEET_ADMIN", email: "auth-service@truckmoov.local", service: "auth" };

    await controller.createDeviceSetupRequest(payload, request({ user: service }));

    const stored = (await repository.findById("req-1", "t1"))!.toPrimitives();
    expect(stored.requestedByUserId).toBeNull();
    expect(stored.requestingEmail).toBeNull();
  });
});

describe("fleet activity client address", () => {
  it("has the config injected into every fleet controller", () => {
    expect(Reflect.getMetadata(PROPERTY_DEPS_METADATA, DeviceSetupRequestsController)).toContainEqual({
      key: "appConfig",
      type: AppConfigService,
    });
  });

  it("carries the caller's address into the audit row and the event", async () => {
    const { controller, auditLog, bus } = harness();

    await controller.createDeviceSetupRequest(payload, request());

    expect(auditLog.record.mock.calls[0][0].metadata.ipAddress).toBe("41.58.1.2");
    expect(bus.publish.mock.calls[0][1].data.metadata.ipAddress).toBe("41.58.1.2");
  });

  it("believes the forwarding header only from a trusted proxy", async () => {
    const { controller, auditLog } = harness(["10.0.0.5"]);

    await controller.createDeviceSetupRequest(
      payload,
      request({ headers: { "x-forwarded-for": "102.89.3.4" }, socket: { remoteAddress: "10.0.0.5" } }),
    );

    expect(auditLog.record.mock.calls[0][0].metadata.ipAddress).toBe("102.89.3.4");
  });

  it("leaves the address out when none can be established", async () => {
    const { controller, auditLog } = harness();

    await controller.createDeviceSetupRequest(payload, request({ headers: undefined, socket: undefined }));

    expect(auditLog.record.mock.calls[0][0].metadata).not.toHaveProperty("ipAddress");
  });
});
