import type { StoredInstaller } from './installer.repository';

/**
 * Picks the installer for an order.
 *
 * FIX: hard-coded until the assignment rules are settled. Today it prefers an
 * active installer working the installation's own state and otherwise takes any
 * active one, which is the least surprising thing that can be said to be a
 * rule. It knows nothing about team capacity, existing bookings for the slot,
 * or travel — all of which a real rule needs.
 *
 * Returning null is a legitimate answer: no installer covers the state and
 * none is free. The order stays scheduled and unassigned rather than being
 * given to somebody who cannot do it.
 */
export function chooseInstaller(
  candidates: StoredInstaller[],
  state: string,
): StoredInstaller | null {
  const active = candidates.filter((installer) => installer.isActive);
  if (active.length === 0) return null;

  const local = active.filter(
    (installer) => installer.state.toLowerCase() === state.trim().toLowerCase(),
  );

  // Ordered by name so the same set of candidates always produces the same
  // answer. An arbitrary pick would make an assignment impossible to explain.
  return [...(local.length > 0 ? local : active)].sort((a, b) =>
    a.fullName.localeCompare(b.fullName),
  )[0];
}
