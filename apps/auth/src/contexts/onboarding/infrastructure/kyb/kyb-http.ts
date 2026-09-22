import type {
  KybCheckResult,
  KybVerificationCheck,
} from '@auth/onboarding/domain/ports/kyb-verification.port';

export const KYB_REQUEST_TIMEOUT_MS = 15_000;

export type KybFieldComparison = KybCheckResult['fields'][number];

export function unavailable(
  check: KybVerificationCheck,
  reference: string,
  provider: string,
  summary: string,
): KybCheckResult {
  return {
    check,
    verdict: 'unavailable',
    reference,
    summary,
    fields: [],
    provider,
    checkedAt: new Date(),
  };
}

/**
 * Compares a registry answer with what the applicant typed.
 *
 * Names are compared loosely on purpose: a registry holds "ARNE LOGISTICS
 * LIMITED" where an applicant typed "Arne Logistics Ltd", and treating that as
 * a mismatch would reject the businesses that did nothing wrong. Numbers are
 * compared exactly, because there is no honest variation in an RC number.
 */
export function compareName(
  name: string,
  expected: string,
  actual: string | null,
): KybFieldComparison {
  return {
    name,
    expected,
    actual,
    matched: actual !== null && normalizeName(actual) === normalizeName(expected),
  };
}

export function compareExact(
  name: string,
  expected: string,
  actual: string | null,
): KybFieldComparison {
  return {
    name,
    expected,
    actual,
    matched:
      actual !== null &&
      actual.replace(/\s+/g, '').toUpperCase() ===
        expected.replace(/\s+/g, '').toUpperCase(),
  };
}

const COMPANY_SUFFIXES =
  /\b(limited|ltd|plc|nigeria|nig|enterprises|enterprise|company|co|and|&)\b/g;

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,'’-]/g, ' ')
    .replace(COMPANY_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A verdict from the comparisons.
 *
 * Every compared field has to agree. A registry that answered with a different
 * owner is a contradiction, not a partial pass — the whole point of asking is
 * that one disagreeing field is the fraud signal.
 */
export function verdictFrom(
  fields: KybFieldComparison[],
): 'match' | 'mismatch' {
  return fields.every((field) => field.matched) ? 'match' : 'mismatch';
}

export function describeMismatch(fields: KybFieldComparison[]): string {
  const failed = fields.filter((field) => !field.matched);
  if (failed.length === 0) return 'Every checked field matched the registry.';
  return failed
    .map(
      (field) =>
        `${field.name} is "${field.actual ?? 'missing'}" at the registry, not "${field.expected ?? ''}"`,
    )
    .join('; ');
}

/**
 * A JSON request that fails as a value rather than as an exception.
 *
 * The caller turns a `null` into an `unavailable` verdict. Letting a vendor
 * outage throw would make it indistinguishable from a registry saying no.
 */
export async function requestJson(
  url: string,
  init: RequestInit,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KYB_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function readString(
  source: unknown,
  ...path: string[]
): string | null {
  let current: unknown = source;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return null;
    current = (current as Record<string, unknown>)[key];
  }
  if (typeof current === 'string' && current.trim().length > 0) {
    return current.trim();
  }
  if (typeof current === 'number') return String(current);
  return null;
}
