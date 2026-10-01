/** registrationKey() in SQL, so a filtered page and its total are counted in the database. */
export const REGISTRATION_KEY_SQL =
  "upper(regexp_replace(coalesce(vehicle_registration, ''), '[^A-Za-z0-9]', '', 'g'))";

/** An `and ... in (...)` clause with its bindings, or nothing when there is no limit. */
export function registrationKeyClause(keys?: ReadonlySet<string> | null): { sql: string; bindings: string[] } {
  if (!keys) return { sql: "", bindings: [] };
  if (keys.size === 0) return { sql: " and false", bindings: [] };
  const bindings = [...keys];
  return { sql: ` and ${REGISTRATION_KEY_SQL} in (${bindings.map(() => "?").join(", ")})`, bindings };
}
