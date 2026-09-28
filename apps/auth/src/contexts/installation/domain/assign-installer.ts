import { validateState } from '@auth/onboarding/domain/onboarding-application.validation';
import { DEFAULT_MAX_ACTIVE_JOBS, type InstallerCapability } from './installer';
import type { StoredInstallationOrder } from './installation-order.repository';
import { takesBooking, workPreferencesOf } from './installer-preferences';
import type { StoredInstaller } from './installer.repository';

export type Booking = Pick<StoredInstallationOrder, 'state' | 'scheduledDate' | 'timeSlot' | 'requiredCapabilities'>;

const LEGACY_CAPABILITY_EQUIVALENTS: Partial<Record<InstallerCapability, readonly InstallerCapability[]>> = {
  tracker_installation_wiring: ['device_installation'],
  sim_installation_activation: ['sim_activation'],
  device_configuration_provisioning: ['device_configuration'],
  fuel_sensor_installation_calibration: ['fuel_sensor_calibration'],
  diagnostics_repairs_troubleshooting: ['diagnostics_troubleshooting'],
};

/**
 * Historic installer profiles used short capability keys. They remain valid
 * only as equivalents of their more precise catalogue entries; arbitrary
 * strings can never make an installer eligible.
 */
function hasCapabilities(installer: StoredInstaller, booking: Booking): boolean {
  const required: InstallerCapability[] = booking.requiredCapabilities?.length
    ? booking.requiredCapabilities
    : ['device_installation'];
  return required.every(
    (capability) =>
      installer.capabilities.includes(capability) ||
      LEGACY_CAPABILITY_EQUIVALENTS[capability]?.some((legacy) => installer.capabilities.includes(legacy)),
  );
}

function stateKey(value: string): string {
  try {
    return validateState(value).toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function canTake(
  installer: StoredInstaller,
  booking: Booking,
  state: string,
  activeJobs: number,
  maxActiveJobs: number,
): boolean {
  return (
    installer.status === 'active' &&
    installer.userId !== null &&
    installer.serviceAreas.some((area) => stateKey(area) === state) &&
    hasCapabilities(installer, booking) &&
    activeJobs < maxActiveJobs &&
    takesBooking(workPreferencesOf(installer.workPreferences), booking)
  );
}

/**
 * Picks the installer for an order: an active, signed-up installer serving the
 * order's state with room for another job, who is available, works on the
 * booked day and whose working hours overlap the slot (Lagos). The least busy
 * wins, then by name so the same candidates always give the same answer.
 *
 * Installers in `excluded` (those who rejected the order) are never offered it again.
 * Null is a legitimate answer: the order stays unassigned until the sweep
 * finds somebody.
 */
export function chooseInstaller(
  candidates: StoredInstaller[],
  booking: Booking,
  activeJobs: ReadonlyMap<string, number>,
  excluded: ReadonlySet<string> = new Set(),
  /** Kept last so existing domain callers remain source-compatible. */
  maxActiveJobs: number = DEFAULT_MAX_ACTIVE_JOBS,
): StoredInstaller | null {
  const wanted = stateKey(booking.state);
  const load = (installer: StoredInstaller) => activeJobs.get(installer.id) ?? 0;
  const eligible = candidates.filter(
    (installer) => !excluded.has(installer.id) && canTake(installer, booking, wanted, load(installer), maxActiveJobs),
  );
  eligible.sort((a, b) => load(a) - load(b) || a.fullName.localeCompare(b.fullName));
  return eligible[0] ?? null;
}
