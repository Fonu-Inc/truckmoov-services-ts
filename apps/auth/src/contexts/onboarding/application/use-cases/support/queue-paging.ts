/**
 * The page and limit come straight off the query string. A page of 0 or -1
 * turns into a negative offset, and the database driver refuses it with a 500.
 * Whole numbers of at least 1 only; anything else is brought back into range.
 */
export function positiveInt(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Math.max(1, Math.floor(value));
}
