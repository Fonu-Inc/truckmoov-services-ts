import { describe, expect, it, vi } from "vitest";
import { RENEWAL_SWEEP_LOCK_ID, RenewalSweepService } from "../../../apps/auth/src/renewal-sweep.service";
import { ENFORCEMENT_SWEEP_LOCK_ID } from "../../../apps/auth/src/enforcement-sweep.service";
import { buildRenewals } from "./renewal-harness";

const inMemory = { persistence: { backend: "in-memory" } } as never;

describe("renewal sweep", () => {
  it("uses its own advisory lock, distinct from the SIM and enforcement sweeps", () => {
    expect(RENEWAL_SWEEP_LOCK_ID).toBe(8_246_113_070_004);
    expect(RENEWAL_SWEEP_LOCK_ID).not.toBe(ENFORCEMENT_SWEEP_LOCK_ID);
    expect(RENEWAL_SWEEP_LOCK_ID).not.toBe(8_246_113_070_002);
  });

  it("runs the generator and reports the counts", async () => {
    const h = await buildRenewals();
    h.addPeriod();
    const sweep = new RenewalSweepService(inMemory, h.service);
    expect(await sweep.run(h.clock.now)).toMatchObject({ issued: 1 });
    expect(await sweep.run(h.clock.now)).toMatchObject({ issued: 0 });
  });

  it("skips a run that starts while another is still going", async () => {
    const h = await buildRenewals();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow = vi.spyOn(h.service, "run").mockImplementation(async () => {
      await gate;
      return { seeded: 0, cancelled: 0, repriced: 0, issued: 1, failed: 0 };
    });
    const sweep = new RenewalSweepService(inMemory, h.service);
    const first = sweep.run();
    expect(await sweep.run()).toMatchObject({ issued: 0 });
    release();
    expect(await first).toMatchObject({ issued: 1 });
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it("starts no timer outside the database backend", () => {
    const timers = vi.spyOn(global, "setTimeout");
    new RenewalSweepService(inMemory, {} as never).onApplicationBootstrap();
    expect(timers).not.toHaveBeenCalled();
    timers.mockRestore();
  });
});
