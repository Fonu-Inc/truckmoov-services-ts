import type { DeviceLifecycleStatus } from "./device-status";

/**
 * Verification is passive. The platform configures a device, then waits for the
 * device to report. It cannot make the device speak. So the outcome of an
 * attempt is its own state with its own deadline, separate from where the
 * device sits in the lifecycle: a failed verification leaves a device
 * "configured" and retryable, not "faulty".
 */
export const DEVICE_VERIFICATION_STATUSES = ["waiting", "verified", "failed"] as const;

export type DeviceVerificationStatus = (typeof DEVICE_VERIFICATION_STATUSES)[number];

export function isDeviceVerificationStatus(
  value: string,
): value is DeviceVerificationStatus {
  return DEVICE_VERIFICATION_STATUSES.includes(value as DeviceVerificationStatus);
}

/** Ingest protocols a device model can report by. */
export const DEVICE_PROTOCOLS = [
  "TCP",
  "UDP",
  "HTTP",
  "MQTT",
  "WEBSOCKET",
  "SDK",
] as const;

export type DeviceProtocol = (typeof DEVICE_PROTOCOLS)[number];

export function isDeviceProtocol(value: string): value is DeviceProtocol {
  return DEVICE_PROTOCOLS.includes(value as DeviceProtocol);
}

/** Protocols that carry a port. The rest are addressed by URL or by SDK. */
const PORTED_PROTOCOLS: readonly DeviceProtocol[] = ["TCP", "UDP"];

export function protocolNeedsPort(protocol: DeviceProtocol): boolean {
  return PORTED_PROTOCOLS.includes(protocol);
}

export const DEVICE_INSTALLATION_ACTIONS = [
  "setup_guide",
  "verify_signal",
  "ready_to_assign",
  "none",
] as const;

export type DeviceInstallationAction = (typeof DEVICE_INSTALLATION_ACTIONS)[number];

export type DeviceNextAction = {
  action: DeviceInstallationAction;
  label: string;
};

const ACTION_LABELS: Record<DeviceInstallationAction, string> = {
  setup_guide: "Setup Guide",
  verify_signal: "Verify Signal",
  ready_to_assign: "Ready to Assign",
  none: "",
};

/**
 * The next action the installer takes. Derived on the server so the queue reads
 * the same on every client, and so a change to the workflow does not need a
 * matching change in the frontend.
 */
export function nextInstallationAction(
  lifecycleStatus: DeviceLifecycleStatus,
  verificationStatus: DeviceVerificationStatus | null,
): DeviceNextAction {
  const action = resolveAction(lifecycleStatus, verificationStatus);
  return { action, label: ACTION_LABELS[action] };
}

function resolveAction(
  lifecycleStatus: DeviceLifecycleStatus,
  verificationStatus: DeviceVerificationStatus | null,
): DeviceInstallationAction {
  switch (lifecycleStatus) {
    case "registered":
    case "config_pending":
      return "setup_guide";
    case "configured":
      // A failed attempt sends the installer back to the guide: the usual
      // causes are a wrong port or a command that did not take.
      return verificationStatus === "failed" ? "setup_guide" : "verify_signal";
    case "verified_online":
      return "ready_to_assign";
    default:
      return "none";
  }
}

/** Lifecycle states that put a device in the installer's queue. */
export const DEVICE_INSTALLATION_QUEUE_STATUSES: readonly DeviceLifecycleStatus[] = [
  "registered",
  "config_pending",
  "configured",
  "verified_online",
];
