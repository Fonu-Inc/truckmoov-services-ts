import { describe, expect, it } from "vitest";
import { TEST_TELEMETRY_IMEI, testTelemetryEnabled, testTelemetryNote } from "@shared/devices";

describe("testTelemetryEnabled", () => {
  it("is off unless the variable is exactly true", () => {
    expect(testTelemetryEnabled({})).toBe(false);
    expect(testTelemetryEnabled({ TEST_TELEMETRY_ENABLED: "TRUE" })).toBe(false);
    expect(testTelemetryEnabled({ TEST_TELEMETRY_ENABLED: "1" })).toBe(false);
    expect(testTelemetryEnabled({ TEST_TELEMETRY_ENABLED: "true" })).toBe(true);
  });
});

describe("TEST_TELEMETRY_IMEI", () => {
  it("accepts exactly 15 digits", () => {
    expect(TEST_TELEMETRY_IMEI.test("359779090012345")).toBe(true);
    expect(TEST_TELEMETRY_IMEI.test("35977909001234")).toBe(false);
    expect(TEST_TELEMETRY_IMEI.test("3597790900123456")).toBe(false);
    expect(TEST_TELEMETRY_IMEI.test("35977909001234a")).toBe(false);
    expect(TEST_TELEMETRY_IMEI.test("359779090012345\n")).toBe(false);
  });
});

describe("testTelemetryNote", () => {
  it("says nothing changed when the device was not waiting", () => {
    expect(testTelemetryNote("verified", "verified", "verified_online")).toBe(
      "The device was not waiting for verification, so nothing changed",
    );
    expect(testTelemetryNote(null, null, "assignable")).toContain("nothing changed");
  });

  it("reports a verification and a still-waiting device", () => {
    expect(testTelemetryNote("waiting", "verified", "verified_online")).toContain("verified_online");
    expect(testTelemetryNote("waiting", "waiting", "configured")).toContain("still waiting");
  });
});
