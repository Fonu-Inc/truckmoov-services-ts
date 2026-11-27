export const TEST_TELEMETRY_DISABLED_MESSAGE = "Test telemetry is disabled on this environment";

export const TEST_TELEMETRY_IMEI = /^\d{15}$/;

/** Read per call from the process environment so the switch stays outside AppConfigService and defaults to off. */
export function testTelemetryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env["TEST_TELEMETRY_ENABLED"] === "true";
}

/** One plain sentence on what a test fix did, from the device's state before and after. */
export function testTelemetryNote(before: string | null, after: string | null, lifecycleAfter: string | null): string {
  if (before !== "waiting") return "The device was not waiting for verification, so nothing changed";
  if (after === "verified") return `The device was verified from the test fix and is now ${lifecycleAfter ?? "verified"}`;
  return "The fix was published but the device is still waiting for verification; check again in a few seconds";
}
