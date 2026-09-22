import { describe, expect, it } from "vitest";
import {
  assertStageAdvance,
  canAdvanceTo,
  InvalidStageTransitionError,
  ONBOARDING_STAGES,
  stageProgress,
  stageStatusLabel,
} from "@auth/onboarding/domain/onboarding-stage";

describe("Onboarding stages", () => {
  it("advances one step at a time", () => {
    expect(canAdvanceTo("application", "provisioning")).toBe(true);
    expect(canAdvanceTo("payment", "installation_scheduling")).toBe(true);
  });

  it("refuses a skipped stage", () => {
    // An onboarding sitting in installation with no payment recorded looks
    // identical afterwards to one that was paid for.
    expect(canAdvanceTo("provisioning", "installation")).toBe(false);
    expect(() => assertStageAdvance("provisioning", "installation")).toThrow(
      InvalidStageTransitionError,
    );
  });

  it("refuses to move backwards or stand still", () => {
    expect(canAdvanceTo("payment", "provisioning")).toBe(false);
    expect(canAdvanceTo("payment", "payment")).toBe(false);
  });

  it("reports what is done, what is current and what is left", () => {
    const progress = stageProgress("payment");

    expect(progress).toHaveLength(ONBOARDING_STAGES.length);
    expect(progress.filter((entry) => entry.complete).map((e) => e.stage)).toEqual([
      "application",
      "provisioning",
    ]);
    expect(progress.find((entry) => entry.current)?.stage).toBe("payment");
    expect(progress.at(-1)).toEqual({
      stage: "fleet_ready",
      complete: false,
      current: false,
    });
  });
});

describe("Queue label", () => {
  it("reads the decision status while the application is the stage", () => {
    expect(stageStatusLabel("application", "submitted")).toBe("Submitted");
    expect(stageStatusLabel("application", "under_review")).toBe(
      "Attention Needed",
    );
    expect(stageStatusLabel("application", "rejected")).toBe("Rejected");
  });

  it("reads the stage once the application is behind it", () => {
    expect(stageStatusLabel("payment", "approved")).toBe("Awaiting Payment");
    expect(stageStatusLabel("installation_scheduling", "approved")).toBe(
      "Awaiting Scheduling",
    );
    expect(stageStatusLabel("fleet_ready", "approved")).toBe("Fleet Ready");
  });
});
