import { BillingValidationError } from '@auth/onboarding/domain/billing-errors';

const CODE_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
const MAX_COMPONENTS = 20;

export function requireCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!CODE_PATTERN.test(code)) {
    throw new BillingValidationError(
      'code',
      'code must be 2 to 64 characters: lowercase letters, digits and underscores, starting with a letter',
    );
  }
  return code;
}

export function requireName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length === 0 || name.length > 120) {
    throw new BillingValidationError('name', 'name must be 1 to 120 characters');
  }
  return name;
}

export function optionalDescription(value: unknown): string {
  if (value === undefined || value === null) return '';
  const description = typeof value === 'string' ? value.trim() : '';
  if (typeof value !== 'string' || description.length > 255) {
    throw new BillingValidationError(
      'description',
      'description must be at most 255 characters',
    );
  }
  return description;
}

export function requireValidityDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new BillingValidationError(
      'validityDays',
      'validityDays must be a whole number of at least 1',
    );
  }
  return value;
}

export function requireComponents(value: unknown): string[] {
  const valid =
    Array.isArray(value) &&
    value.length <= MAX_COMPONENTS &&
    value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 120);
  if (!valid) {
    throw new BillingValidationError(
      'components',
      `components must be at most ${MAX_COMPONENTS} non-empty labels of up to 120 characters`,
    );
  }
  return (value as string[]).map((item) => item.trim());
}
