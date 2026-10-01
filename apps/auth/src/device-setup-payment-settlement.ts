import type { DeviceSetupRequestStatus, StoredDeviceSetupRequest } from './device-setup-request.repository';

/**
 * No payment provider yet, so approval settles payment itself. The one switch
 * for a gateway: set false and approval stops at awaiting_payment until the
 * payment is confirmed.
 */
export const SETTLE_DEVICE_REQUEST_PAYMENT_AUTOMATICALLY = true;

export const AUTO_SETTLED_PAYMENT_NOTE = 'payment auto-approved';

type Timeline = StoredDeviceSetupRequest['timeline'];

/** Where an approved, priced request lands, with the timeline that gets it there. */
export function settleApprovedPayment(timeline: Timeline): {
  status: Extract<DeviceSetupRequestStatus, 'awaiting_payment' | 'ready_for_installation'>;
  timeline: Timeline;
} {
  if (!SETTLE_DEVICE_REQUEST_PAYMENT_AUTOMATICALLY) return { status: 'awaiting_payment', timeline };
  const settled = { status: 'ready_for_installation', at: new Date().toISOString(), note: AUTO_SETTLED_PAYMENT_NOTE };
  return { status: 'ready_for_installation', timeline: [...timeline, settled] };
}
