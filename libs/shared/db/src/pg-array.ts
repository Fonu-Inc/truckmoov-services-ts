/**
 * A Postgres text[] literal for `= any(?::text[])`. A plain JS array bound to
 * one `?` is expanded by knex into `'a', 'b'`, which is a syntax error there.
 */
export function pgTextArray(values: readonly string[]): string {
  return `{${values.map((value) => `"${value.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
}
