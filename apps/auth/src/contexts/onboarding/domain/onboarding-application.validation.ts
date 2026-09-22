import {
  ONBOARDING_APPLICANT_TYPES,
  type OnboardingApplicantType,
} from './onboarding-application.repository';

// Nested DTO validation does not fire under BodyOrDataPipe, so these functions
// are the enforcement point, not the decorators on the DTO.
export class OnboardingValidationError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'OnboardingValidationError';
  }
}

export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT',
  'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi',
  'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo',
  'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const;

const NAME_PATTERN = /^[\p{L}][\p{L}\s'’.-]*$/u;
const ORG_NAME_PATTERN = /^[\p{L}\p{N}\s&'’.,()\/-]+$/u;

export function validateApplicantType(value: unknown): OnboardingApplicantType {
  const candidate = String(value ?? '').trim();
  if (
    !(ONBOARDING_APPLICANT_TYPES as readonly string[]).includes(candidate)
  ) {
    throw new OnboardingValidationError(
      'applicantType',
      `Applicant type must be one of: ${ONBOARDING_APPLICANT_TYPES.join(', ')}`,
    );
  }
  return candidate as OnboardingApplicantType;
}

export function validateOrganizationName(value: unknown): string {
  const name = collapseSpaces(String(value ?? ''));
  assertLength('organizationName', 'Organization name', name, 2, 160);
  if (!ORG_NAME_PATTERN.test(name) || !/\p{L}/u.test(name)) {
    throw new OnboardingValidationError(
      'organizationName',
      'Organization name contains unsupported characters',
    );
  }
  return name;
}

export function validateBusinessEmail(value: unknown): string {
  const email = String(value ?? '').trim().toLowerCase();
  if (email.length === 0 || email.length > 254) {
    throw new OnboardingValidationError(
      'businessEmail',
      'Business email must be between 1 and 254 characters',
    );
  }
  const parts = email.split('@');
  if (parts.length !== 2) {
    throw new OnboardingValidationError(
      'businessEmail',
      'Business email must contain a single @',
    );
  }
  const [local, domain] = parts;
  const domainIsValid =
    domain.includes('.') &&
    !domain.startsWith('.') &&
    !domain.endsWith('.') &&
    !domain.includes('..') &&
    domain
      .split('.')
      .every((label) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label)) &&
    /^[a-z]{2,}$/.test(domain.split('.').pop() ?? '');
  if (
    local.length === 0 ||
    local.length > 64 ||
    /\s/.test(email) ||
    !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local) ||
    local.startsWith('.') ||
    local.endsWith('.') ||
    local.includes('..') ||
    !domainIsValid
  ) {
    throw new OnboardingValidationError(
      'businessEmail',
      'Business email is not a valid address',
    );
  }
  return email;
}

/**
 * Nigerian mobile numbers only, normalised to E.164. A letter anywhere in the
 * input is rejected outright rather than stripped: silently dropping it turns a
 * typo into a valid number belonging to somebody else.
 */
export function validateNigerianPhone(value: unknown, field: string): string {
  const raw = String(value ?? '').trim();
  if (/\p{L}/u.test(raw)) {
    throw new OnboardingValidationError(
      field,
      'Phone number must not contain letters',
    );
  }

  const compact = raw.replace(/[\s()\-.]/g, '');
  if (!/^\+?\d+$/.test(compact)) {
    throw new OnboardingValidationError(
      field,
      'Phone number must contain digits only',
    );
  }

  const digits = compact.replace(/^\+/, '');
  let national: string | null = null;
  if (/^234\d{10}$/.test(digits)) national = digits.slice(3);
  else if (/^0\d{10}$/.test(digits)) national = digits.slice(1);
  else if (/^\d{10}$/.test(digits)) national = digits;

  if (national === null || !/^[789][01]\d{8}$/.test(national)) {
    throw new OnboardingValidationError(
      field,
      'Phone number must be a valid Nigerian mobile number',
    );
  }

  return `+234${national}`;
}

export function validateContactFullName(value: unknown): string {
  const name = collapseSpaces(String(value ?? ''));
  assertLength('contactFullName', 'Contact full name', name, 2, 80);
  if (!NAME_PATTERN.test(name)) {
    throw new OnboardingValidationError(
      'contactFullName',
      'Contact full name must not contain digits or symbols',
    );
  }
  if (name.split(' ').length < 2) {
    throw new OnboardingValidationError(
      'contactFullName',
      'Contact full name must include a first and last name',
    );
  }
  return name;
}

export function validateContactRole(value: unknown): string {
  const role = collapseSpaces(String(value ?? ''));
  assertLength('contactRole', 'Role', role, 2, 80);
  if (!/\p{L}/u.test(role)) {
    throw new OnboardingValidationError(
      'contactRole',
      'Role must contain letters',
    );
  }
  return role;
}

export function validateStreetAddress(value: unknown): string {
  const address = collapseSpaces(String(value ?? ''));
  assertLength('streetAddress', 'Street address', address, 3, 200);
  return address;
}

export function validateCity(value: unknown): string {
  const city = collapseSpaces(String(value ?? ''));
  assertLength('city', 'City', city, 2, 80);
  if (!NAME_PATTERN.test(city)) {
    throw new OnboardingValidationError(
      'city',
      'City must not contain digits or symbols',
    );
  }
  return city;
}

export function validateState(value: unknown): string {
  const candidate = collapseSpaces(String(value ?? ''));
  const match = NIGERIAN_STATES.find(
    (state) => state.toLowerCase() === candidate.toLowerCase(),
  );
  if (!match) {
    throw new OnboardingValidationError(
      'state',
      'State must be a Nigerian state or FCT',
    );
  }
  return match;
}

export function validateVerificationCode(value: unknown): string {
  const code = String(value ?? '').trim();
  if (!/^\d{6}$/.test(code)) {
    throw new OnboardingValidationError(
      'code',
      'Verification code must be 6 digits',
    );
  }
  return code;
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function assertLength(
  field: string,
  label: string,
  value: string,
  min: number,
  max: number,
): void {
  if (value.length < min || value.length > max) {
    throw new OnboardingValidationError(
      field,
      `${label} must be between ${min} and ${max} characters`,
    );
  }
}
