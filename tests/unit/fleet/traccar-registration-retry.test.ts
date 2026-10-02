import { describe, expect, it } from "vitest";
import { CreateDeviceUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/create-device.use-case";
import { RetryTraccarRegistrationsUseCase } from "../../../apps/fleet/src/contexts/fleet/devices/application/use-cases/retry-traccar-registrations.use-case";
import {
  MAX_PROVISION_ATTEMPTS,
  nextProvisionAttemptAt,
  provisionRetryDelayMs,
} from "../../../apps/fleet/src/contexts/fleet/devices/domain/provision-retry";
import { InMemoryDeviceRepository } from "../../../apps/fleet/src/contexts/fleet/devices/infrastructure/repositories/in-memory-device.repository";
import type { TraccarDeviceProvisioner } from "../../../apps/fleet/src/contexts/fleet/devices/domain/ports/traccar-device.port";

const runtime = { generateId: () => "dev-1", getDefaultTenantId: () => "t1" } as never;
const quota = { assertWithinQuota: async () => {} } as never;
const publisher = { publish: async () => {} } as never;
const command = { imei: "359779090012345", manufacturer: "Teltonika", model: "FMC130", firmwareVersion: "3.28" };

function provisioner(outcomes: Array<"fail" | "ok">): TraccarDeviceProvisioner {
  return {
    async register() {
      const next = outcomes.shift() ?? "ok";
      if (next === "fail") throw new Error("traccar unreachable");
      return { traccarDeviceId: "tc-1" };
    },
    async deregister() {},
  };
}

async function failedDevice(repo: InMemoryDeviceRepository) {
  const created = await new CreateDeviceUseCase(repo, runtime, provisioner(["fail"]), publisher, quota).execute(command);
  return created;
}

describe("Traccar registration retry", () => {
  it("records the first failure with an attempt count, a reason and a next attempt", async () => {
    const created = await failedDevice(new InMemoryDeviceRepository());
    expect(created.provisionStatus).toBe("failed");
    expect(created.provisionAttempts).toBe(1);
    expect(created.provisionError).toBe("traccar unreachable");
    expect(created.provisionNextAttemptAt).not.toBeNull();
  });

  it("registers a failed device once Traccar is back and clears the failure state", async () => {
    const repo = new InMemoryDeviceRepository();
    await failedDevice(repo);
    const retry = new RetryTraccarRegistrationsUseCase(repo, provisioner(["ok"]));
    const later = new Date(Date.now() + 10 * 60_000);

    expect(await retry.execute(later)).toEqual({ retried: 1, registered: 1, failed: 0 });
    const device = await repo.findById("dev-1", "t1");
    expect(device?.provisionStatus).toBe("registered");
    expect(device?.traccarDeviceId).toBe("tc-1");
    expect(device?.provisionNextAttemptAt).toBeNull();
    expect(device?.provisionError).toBeNull();
  });

  it("waits for the backoff before trying again", async () => {
    const repo = new InMemoryDeviceRepository();
    await failedDevice(repo);
    const retry = new RetryTraccarRegistrationsUseCase(repo, provisioner(["ok"]));
    expect(await retry.execute(new Date())).toEqual({ retried: 0, registered: 0, failed: 0 });
  });

  it("backs off further after each failure and gives up after the maximum", async () => {
    const repo = new InMemoryDeviceRepository();
    await failedDevice(repo);
    const retry = new RetryTraccarRegistrationsUseCase(repo, provisioner(Array(20).fill("fail")));

    let clock = Date.now();
    for (let pass = 0; pass < MAX_PROVISION_ATTEMPTS + 2; pass += 1) {
      clock += 7 * 60 * 60 * 1000;
      await retry.execute(new Date(clock));
    }

    const device = await repo.findById("dev-1", "t1");
    expect(device?.provisionStatus).toBe("failed");
    expect(device?.provisionAttempts).toBe(MAX_PROVISION_ATTEMPTS);
    expect(device?.provisionNextAttemptAt).toBeNull();
    expect(device?.provisionError).toBe("traccar unreachable");
  });

  it("grows the delay and caps it", () => {
    expect(provisionRetryDelayMs(2)).toBe(2 * provisionRetryDelayMs(1));
    expect(provisionRetryDelayMs(30)).toBe(6 * 60 * 60 * 1000);
    expect(nextProvisionAttemptAt(MAX_PROVISION_ATTEMPTS, new Date())).toBeNull();
  });
});
