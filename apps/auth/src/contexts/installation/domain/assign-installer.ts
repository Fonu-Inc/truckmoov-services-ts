import { validateState } from '@auth/onboarding/domain/onboarding-application.validation';
import { DEFAULT_MAX_ACTIVE_JOBS, type InstallerCapability } from './installer';
import type { StoredInstallationOrder } from './installation-order.repository';
import { takesBooking, workPreferencesOf } from './installer-preferences';
import type { StoredInstaller } from './installer.repository';

export type Booking = Pick<StoredInstallationOrder, 'state' | 'scheduledDate' | 'timeSlot' | 'requiredCapabilities'>;

const CURRENT_FOR_LEGACY: Partial<Record<InstallerCapability, InstallerCapability>> = {
  device_installation: 'tracker_installation_wiring',
  sim_activation: 'sim_installation_activation',
  device_configuration: 'device_configuration_provisioning',
  fuel_sensor_calibration: 'fuel_sensor_installation_calibration',
  diagnostics_troubleshooting: 'diagnostics_repairs_troubleshooting',
};

function canonical(capability: InstallerCapability): InstallerCapability {
  return CURRENT_FOR_LEGACY[capability] ?? capability;
}

/**
 * Historic records use short capability keys. A short key and its catalogue
 * entry are the same skill whichever side holds which, so both the order and
 * the installer are compared in canonical form. Arbitrary strings can never
 * make an installer eligible.
 */
function hasCapabilities(installer: StoredInstaller, booking: Booking): boolean {
  const required: InstallerCapability[] = booking.requiredCapabilities?.length
    ? booking.requiredCapabilities
    : ['device_installation'];
  const held = new Set(installer.capabilities.map(canonical));
  return required.every((capability) => held.has(canonical(capability)));
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
