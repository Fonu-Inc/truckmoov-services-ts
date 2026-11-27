type Executor = { execute(sql: string, params?: unknown[]): Promise<unknown> };

// Positive-only: fleet tables are created by another app's migrations, so a miss must be re-checked.
const known = new Set<string>();

export async function tableExists(connection: Executor, name: string): Promise<boolean> {
  if (known.has(name)) return true;
  const rows = (await connection.execute(
    "select exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = ?) as exists",
    [name],
  )) as Array<{ exists?: unknown }> | undefined;
  const value = rows?.[0]?.exists;
  const ok = value === true || value === 1 || value === "1" || value === "t" || value === "true";
  if (ok) known.add(name);
  return ok;
}

export function resetTableExistsCache(): void {
  known.clear();
}
