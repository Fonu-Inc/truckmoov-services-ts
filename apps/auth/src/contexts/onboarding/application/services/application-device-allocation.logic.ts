export function owedDevices(requested: number, held: number): number {
  return Math.max(0, requested - held);
}

/** One alert per shortfall: silent until the owed count changes, and again after it clears. */
export function shouldRaiseShortfallAlert(alertedOwed: number | null, owed: number): boolean {
  return owed > 0 && alertedOwed !== owed;
}

/**
 * Applications, oldest first, that the stock can still reach. Stops once the
 * stock is spent, so a tick never calls fleet for an application that would get nothing.
 */
export function selectOwedWithStock<T extends { owed: number }>(owing: T[], stock: number): T[] {
  const picked: T[] = [];
  let remaining = stock;
  for (const row of owing) {
    if (remaining < 1) break;
    picked.push(row);
    remaining -= Math.min(row.owed, remaining);
  }
  return picked;
}
