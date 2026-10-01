// Busy from assignment until delivery. Dispatch's in_progress filter starts at
// en-route, so callers match these statuses themselves.
export const ACTIVE_JOB_STATUSES: ReadonlySet<string> = new Set(["assigned", "en-route", "arrived", "loaded"]);
