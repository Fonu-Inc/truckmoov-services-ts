import { describe, expect, it } from "vitest";
import { resolveTriggeredRule } from "../../../apps/auth/src/auto-block-evaluation";
import type { StoredAutoBlockRule } from "../../../apps/auth/src/auto-block-rule.repository";

function rule(overrides: Partial<StoredAutoBlockRule> = {}): StoredAutoBlockRule {
  return {
    id: "aggressive_protection",
    name: "Aggressive Protection",
    enabled: true,
    maxAttempts: 3,
    windowMinutes: 10,
    blockDurationHours: 72,
    precedence: 1,
    updatedAt: new Date(),
    updatedBy: null,
    ...overrides,
  };
}

describe("Auto-block rule precedence", () => {
  it("triggers the first matching rule in precedence order", () => {
    const aggressive = rule({ id: "aggressive_protection", precedence: 1, maxAttempts: 3 });
    const standard = rule({ id: "standard_protection", precedence: 2, maxAttempts: 5, name: "Standard Protection" });

    // Both rules' thresholds are met. Precedence decides, not which was
    // enumerated first in the array passed in.
    const counts: Record<string, number> = { aggressive_protection: 4, standard_protection: 6 };
    const result = resolveTriggeredRule([standard, aggressive], (r) => counts[r.id]);

    expect(result?.ruleId).toBe("aggressive_protection");
  });

  it("does not stop at a disabled rule even if its threshold is met", () => {
    const disabled = rule({ id: "aggressive_protection", precedence: 1, enabled: false });
    const standard = rule({ id: "standard_protection", precedence: 2, maxAttempts: 5, name: "Standard Protection" });

    const result = resolveTriggeredRule([disabled, standard], () => 10);

    expect(result?.ruleId).toBe("standard_protection");
  });

  it("returns null when no enabled rule's threshold is met", () => {
    const aggressive = rule({ maxAttempts: 3 });
    const result = resolveTriggeredRule([aggressive], () => 2);
    expect(result).toBeNull();
  });

  it("triggers exactly at the threshold, not only past it", () => {
    const aggressive = rule({ maxAttempts: 3 });
    const result = resolveTriggeredRule([aggressive], () => 3);
    expect(result?.ruleId).toBe("aggressive_protection");
  });

  it("carries a null duration through for a permanent rule", () => {
    const bruteForce = rule({
      id: "brute_force_prevention", name: "Brute Force Prevention",
      maxAttempts: 10, blockDurationHours: null, precedence: 3,
    });
    const result = resolveTriggeredRule([bruteForce], () => 10);
    expect(result?.durationHours).toBeNull();
  });

  it("evaluates every rule independently of the others' counts", () => {
    // Each rule has its own window, so the caller supplies a count per rule
    // rather than one shared number — this proves the callback is invoked
    // per rule, not just once.
    const calls: string[] = [];
    const aggressive = rule({ id: "aggressive_protection", precedence: 1, maxAttempts: 3 });
    const standard = rule({ id: "standard_protection", precedence: 2, maxAttempts: 5, name: "s" });

    resolveTriggeredRule([aggressive, standard], (r) => {
      calls.push(r.id);
      return 0;
    });

    expect(calls).toEqual(["aggressive_protection", "standard_protection"]);
  });
});
