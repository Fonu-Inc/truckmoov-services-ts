const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A date-only upper bound means the whole of that day, not its first instant. */
export function inclusiveEnd(to?: string): string | undefined {
  return to && DATE_ONLY.test(to) ? `${to}T23:59:59.999Z` : to;
}
