export type DeviceHeartbeat = "online" | "offline" | "never_reported";

/** The moment and window a device's last report is judged against. */
export type HeartbeatWindow = {
  onlineThresholdMs: number;
  now: number;
};

export function heartbeatWindow(onlineThresholdSeconds: number, now = Date.now()): HeartbeatWindow {
  return { onlineThresholdMs: onlineThresholdSeconds * 1000, now };
}

/**
 * Online when the last report is inside the window, inclusive, matching the
 * tracking service's health rule so the two never disagree on the boundary.
 */
export function deviceHeartbeat(lastSeen: string | null | undefined, window: HeartbeatWindow): DeviceHeartbeat {
  const seenAt = lastSeen ? Date.parse(lastSeen) : Number.NaN;
  if (Number.isNaN(seenAt)) return "never_reported";
  return window.now - seenAt <= window.onlineThresholdMs ? "online" : "offline";
}
