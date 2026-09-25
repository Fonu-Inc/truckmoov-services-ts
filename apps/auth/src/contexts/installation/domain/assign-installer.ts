import { validateState } from '@auth/onboarding/domain/onboarding-application.validation';
import type { StoredInstaller } from './installer.repository';

function stateKey(value: string): string {
  try {
    return validateState(value).toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function canTake(installer: StoredInstaller, state: string, activeJobs: number): boolean {
  return (
    installer.status === 'active' &&
    installer.userId !== null &&
    installer.serviceAreas.some((area) => stateKey(area) === state) &&
    activeJobs < installer.maxActiveJobs
  );
}

/**
 * Picks the installer for an order: an active, signed-up installer serving the
 * order's state with room for another job. The least busy wins, then by name
 * so the same candidates always give the same answer.
 *
 * Installers in `excluded` (those who rejected the order) are never offered it again.
 * Null is a legitimate answer: the order stays unassigned until the sweep
 * finds somebody.
 */
export function chooseInstaller(
  candidates: StoredInstaller[],
  state: string,
  activeJobs: ReadonlyMap<string, number>,
  excluded: ReadonlySet<string> = new Set(),
): StoredInstaller | null {
  const wanted = stateKey(state);
  const load = (installer: StoredInstaller) => activeJobs.get(installer.id) ?? 0;
  const eligible = candidates.filter(
    (installer) => !excluded.has(installer.id) && canTake(installer, wanted, load(installer)),
  );
  eligible.sort((a, b) => load(a) - load(b) || a.fullName.localeCompare(b.fullName));
  return eligible[0] ?? null;
}
