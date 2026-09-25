import { validateState } from '@auth/onboarding/domain/onboarding-application.validation';
import type { StoredInstallationOrder } from './installation-order.repository';
import { takesBooking, workPreferencesOf } from './installer-preferences';
import type { StoredInstaller } from './installer.repository';

export type Booking = Pick<StoredInstallationOrder, 'state' | 'scheduledDate' | 'timeSlot'>;

function stateKey(value: string): string {
  try {
    return validateState(value).toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function canTake(installer: StoredInstaller, booking: Booking, state: string, activeJobs: number): boolean {
  return (
    installer.status === 'active' &&
    installer.userId !== null &&
    installer.serviceAreas.some((area) => stateKey(area) === state) &&
    activeJobs < installer.maxActiveJobs &&
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
): StoredInstaller | null {
  const wanted = stateKey(booking.state);
  const load = (installer: StoredInstaller) => activeJobs.get(installer.id) ?? 0;
  const eligible = candidates.filter(
    (installer) => !excluded.has(installer.id) && canTake(installer, booking, wanted, load(installer)),
  );
  eligible.sort((a, b) => load(a) - load(b) || a.fullName.localeCompare(b.fullName));
  return eligible[0] ?? null;
}
