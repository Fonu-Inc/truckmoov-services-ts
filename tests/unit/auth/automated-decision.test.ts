import { describe, expect, it } from "vitest";
import { decideAutomatically } from "@auth/onboarding/domain/automated-decision";
import type {
  KybCheckResult,
  KybVerdict,
  KybVerificationCheck,
} from "@auth/onboarding/domain/ports/kyb-verification.port";

function result(
  check: KybVerificationCheck,
  verdict: KybVerdict,
  summary = "",
): KybCheckResult {
  return {
    check,
    verdict,
    reference: "RC1234567",
    summary: summary || `${check} ${verdict}`,
    fields: [],
    provider: "test-registry",
    checkedAt: new Date(),
  };
}

const ENTERPRISE_PASS = [
  result("cac_registration", "match"),
  result("tax_identification", "match"),
  result("vehicle_registration", "match"),
];

describe("Automated decision", () => {
  it("approves an enterprise applicant whose required checks all matched", () => {
    expect(decideAutomatically("fleet_provider", ENTERPRISE_PASS).outcome).toBe(
      "approve",
    );
  });

  it("approves an owner operator on identity and vehicle alone", () => {
    const decision = decideAutomatically("owner_operator", [
      result("identity", "match"),
      result("vehicle_registration", "match"),
    ]);

    expect(decision.outcome).toBe("approve");
  });

  it("rejects when a registry contradicts the application", () => {
    const decision = decideAutomatically("fleet_provider", [
      ...ENTERPRISE_PASS.slice(1),
      result("cac_registration", "mismatch", "registered to another company"),
    ]);

    expect(decision.outcome).toBe("reject");
    expect(decision.reason).toContain("registered to another company");
  });

  it("rejects when the registry has no such record", () => {
    const decision = decideAutomatically("fleet_provider", [
      ...ENTERPRISE_PASS.slice(1),
      result("cac_registration", "not_found"),
    ]);

    expect(decision.outcome).toBe("reject");
  });

  it("sends an unanswered check to a human rather than approving it", () => {
    const decision = decideAutomatically("fleet_provider", [
      result("cac_registration", "match"),
      result("tax_identification", "unavailable"),
      result("vehicle_registration", "match"),
    ]);

    expect(decision.outcome).toBe("manual_review");
    expect(decision.reason).toContain("tax identification");
  });

  it("sends a missing required check to a human", () => {
    const decision = decideAutomatically("fleet_provider", [
      result("cac_registration", "match"),
      result("vehicle_registration", "match"),
    ]);

    expect(decision.outcome).toBe("manual_review");
    expect(decision.reason).toContain("tax identification");
  });

  it("never approves on no checks at all", () => {
    expect(decideAutomatically("fleet_provider", []).outcome).toBe(
      "manual_review",
    );
    expect(decideAutomatically("owner_operator", []).outcome).toBe(
      "manual_review",
    );
  });

  it("prefers a contradiction over an unanswered check", () => {
    const decision = decideAutomatically("fleet_provider", [
      result("cac_registration", "mismatch"),
      result("tax_identification", "unavailable"),
    ]);

    expect(decision.outcome).toBe("reject");
  });

  it("does not let an extra passing check stand in for a required one", () => {
    const decision = decideAutomatically("owner_operator", [
      result("identity", "match"),
      result("cac_registration", "match"),
    ]);

    expect(decision.outcome).toBe("manual_review");
    expect(decision.reason).toContain("vehicle registration");
  });
});
