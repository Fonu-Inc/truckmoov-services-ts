import { describe, expect, it } from "vitest";
import {
  compareExact,
  compareName,
  describeMismatch,
  readString,
  verdictFrom,
} from "@auth/onboarding/infrastructure/kyb/kyb-http";

describe("Registry name comparison", () => {
  it("accepts the company suffix variations a registry holds", () => {
    for (const registryName of [
      "ARNE LOGISTICS LIMITED",
      "Arne Logistics Ltd.",
      "Arne Logistics Nigeria Limited",
      "arne  logistics",
    ]) {
      expect(
        compareName("Company name", "Arne Logistics Ltd", registryName).matched,
      ).toBe(true);
    }
  });

  it("rejects a different company", () => {
    expect(
      compareName("Company name", "Arne Logistics Ltd", "Bola Haulage Ltd")
        .matched,
    ).toBe(false);
  });

  it("treats a missing registry value as no match", () => {
    expect(compareName("Company name", "Arne Logistics Ltd", null).matched).toBe(
      false,
    );
  });
});

describe("Registry identifier comparison", () => {
  it("ignores spacing and case but nothing else", () => {
    expect(compareExact("RC number", "RC1234567", "rc 1234567").matched).toBe(
      true,
    );
    expect(compareExact("RC number", "RC1234567", "RC1234568").matched).toBe(
      false,
    );
  });
});

describe("Verdict", () => {
  it("needs every compared field to agree", () => {
    const fields = [
      compareName("Company name", "Arne Logistics Ltd", "ARNE LOGISTICS LTD"),
      compareExact("RC number", "RC1234567", "RC1234567"),
    ];
    expect(verdictFrom(fields)).toBe("match");

    fields.push(compareExact("Chassis number", "ABC123", "XYZ999"));
    expect(verdictFrom(fields)).toBe("mismatch");
  });

  it("explains which field disagreed", () => {
    const summary = describeMismatch([
      compareName("Registered owner", "Jane Doe", "John Smith"),
    ]);

    expect(summary).toContain("Registered owner");
    expect(summary).toContain("John Smith");
  });
});

describe("Reading a vendor payload", () => {
  it("walks a path and trims the value", () => {
    expect(readString({ cac: { companyName: "  Arne  " } }, "cac", "companyName")).toBe(
      "Arne",
    );
  });

  it("returns null for anything missing, blank or the wrong shape", () => {
    expect(readString({ cac: {} }, "cac", "companyName")).toBeNull();
    expect(readString({ cac: { companyName: "   " } }, "cac", "companyName")).toBeNull();
    expect(readString(null, "cac")).toBeNull();
    expect(readString({ cac: [] }, "cac", "companyName")).toBeNull();
  });

  it("accepts a number the vendor sent unquoted", () => {
    expect(readString({ entity: { tin: 12345678 } }, "entity", "tin")).toBe(
      "12345678",
    );
  });
});
