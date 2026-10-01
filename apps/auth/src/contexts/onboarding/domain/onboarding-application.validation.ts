import {
  ONBOARDING_APPLICANT_TYPES,
  ONBOARDING_IDENTIFICATION_TYPES,
  ONBOARDING_VEHICLE_PURCHASE_TYPES,
  ONBOARDING_VEHICLE_TYPES,
  type OnboardingApplicantType,
  type OnboardingIdentificationType,
  type OnboardingVehiclePurchaseType,
  type OnboardingVehicleType,
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

export function validateContactFullName(value: unknown, field = 'contactFullName'): string {
  const name = collapseSpaces(String(value ?? ''));
  assertLength(field, 'Contact full name', name, 2, 80);
  if (!NAME_PATTERN.test(name)) {
    throw new OnboardingValidationError(
      field,
      'Contact full name must not contain digits or symbols',
    );
  }
  if (name.split(' ').length < 2) {
    throw new OnboardingValidationError(
      field,
      'Contact full name must include a first and last name',
    );
  }
  return name;
}

export function validateContactRole(value: unknown): string | null {
  const role = collapseSpaces(String(value ?? ''));
  if (role.length === 0) return null;
  assertLength('contactRole', 'Role', role, 2, 80);
  if (!/\p{L}/u.test(role)) {
    throw new OnboardingValidationError(
      'contactRole',
      'Role must contain letters',
    );
  }
  return role;
}

export function validateRcNumber(value: unknown): string | null {
  const rc = collapseSpaces(String(value ?? '')).toUpperCase();
  if (rc.length === 0) return null;
  if (!/^(RC|BN|IT)?[- ]?\d{4,10}$/.test(rc)) {
    throw new OnboardingValidationError(
      'rcNumber',
      'RC number must be 4 to 10 digits, optionally prefixed with RC, BN or IT',
    );
  }
  return rc.replace(/[- ]/g, '');
}

export function validateTaxIdentificationNumber(value: unknown): string | null {
  const tin = collapseSpaces(String(value ?? '')).toUpperCase();
  if (tin.length === 0) return null;
  if (!/^\d{8,15}(-\d{4})?$/.test(tin)) {
    throw new OnboardingValidationError(
      'taxIdentificationNumber',
      'Tax identification number must be 8 to 15 digits',
    );
  }
  return tin;
}

export function validateIdentificationType(
  value: unknown,
): OnboardingIdentificationType | null {
  const candidate = String(value ?? '').trim().toLowerCase();
  if (candidate.length === 0) return null;
  if (!(ONBOARDING_IDENTIFICATION_TYPES as readonly string[]).includes(candidate)) {
    throw new OnboardingValidationError(
      'identificationType',
      `Identification type must be one of: ${ONBOARDING_IDENTIFICATION_TYPES.join(', ')}`,
    );
  }
  return candidate as OnboardingIdentificationType;
}

export function validateIdentificationNumber(value: unknown): string | null {
  const number = collapseSpaces(String(value ?? '')).toUpperCase();
  if (number.length === 0) return null;
  if (!/^[A-Z0-9]{6,20}$/.test(number)) {
    throw new OnboardingValidationError(
      'identificationNumber',
      'Identification number must be 6 to 20 letters or digits',
    );
  }
  return number;
}

export function validateRegistrationNumber(value: unknown): string {
  const plate = collapseSpaces(String(value ?? '')).toUpperCase();
  assertLength('registrationNumber', 'Registration number', plate, 4, 20);
  if (!/^[A-Z0-9][A-Z0-9 -]*$/.test(plate)) {
    throw new OnboardingValidationError(
      'registrationNumber',
      'Registration number must contain only letters, digits, spaces and hyphens',
    );
  }
  return plate;
}

export function validateVehicleType(value: unknown): OnboardingVehicleType {
  const candidate = String(value ?? '').trim().toLowerCase();
  if (!(ONBOARDING_VEHICLE_TYPES as readonly string[]).includes(candidate)) {
    throw new OnboardingValidationError(
      'vehicleType',
      `Vehicle type must be one of: ${ONBOARDING_VEHICLE_TYPES.join(', ')}`,
    );
  }
  return candidate as OnboardingVehicleType;
}

export function validateVehicleTextField(
  field: string,
  label: string,
  value: unknown,
  { required, max }: { required: boolean; max: number },
): string | null {
  const text = collapseSpaces(String(value ?? ''));
  if (text.length === 0) {
    if (!required) return null;
    throw new OnboardingValidationError(field, `${label} is required`);
  }
  assertLength(field, label, text, 1, max);
  return text;
}

export function validateVehicleYear(value: unknown): number | null {
  const text = String(value ?? '').trim();
  if (text.length === 0) return null;
  const year = Number(text);
  const limit = new Date().getFullYear() + 1;
  if (!Number.isInteger(year) || year < 1950 || year > limit) {
    throw new OnboardingValidationError(
      'year',
      `Vehicle year must be between 1950 and ${limit}`,
    );
  }
  return year;
}

export function validateOdometerReading(value: unknown): number | null {
  const text = String(value ?? '').trim();
  if (text.length === 0) return null;
  const reading = Number(text.replace(/[, ]/g, ''));
  if (!Number.isInteger(reading) || reading < 0 || reading > 10_000_000) {
    throw new OnboardingValidationError(
      'odometerReading',
      'Odometer reading must be a whole number of kilometres',
    );
  }
  return reading;
}

export function validateVehiclePurchaseType(
  value: unknown,
): OnboardingVehiclePurchaseType | null {
  const candidate = String(value ?? '').trim().toLowerCase();
  if (candidate.length === 0) return null;
  if (!(ONBOARDING_VEHICLE_PURCHASE_TYPES as readonly string[]).includes(candidate)) {
    throw new OnboardingValidationError(
      'purchaseType',
      `Purchase type must be one of: ${ONBOARDING_VEHICLE_PURCHASE_TYPES.join(', ')}`,
    );
  }
  return candidate as OnboardingVehiclePurchaseType;
}

export function validateDeviceQuantity(value: unknown): number {
  const quantity = Number(String(value ?? '').trim());
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
    throw new OnboardingValidationError(
      'quantity',
      'Number of devices must be a whole number between 1 and 500',
    );
  }
  return quantity;
}

export function validateDeviceUseCase(value: unknown): string {
  const useCase = collapseSpaces(String(value ?? ''));
  assertLength('useCase', 'Use case', useCase, 10, 1000);
  return useCase;
}

export function validateDeviceNotes(value: unknown): string | null {
  const notes = collapseSpaces(String(value ?? ''));
  if (notes.length === 0) return null;
  assertLength('notes', 'Notes', notes, 1, 1000);
  return notes;
}

export function validateStreetAddress(value: unknown, field = 'streetAddress'): string {
  const address = collapseSpaces(String(value ?? ''));
  assertLength(field, 'Street address', address, 3, 200);
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

/**
 * The same address rules under the field the form actually has. Reporting a
 * bad billing email as businessEmail puts the error on the wrong input, since
 * the client binds messages by field.
 */
export function validateBillingEmail(value: unknown): string {
  return underField(() => validateBusinessEmail(value), 'billingEmail', 'Business email', 'Billing email');
}

/** The signer's name follows the contact name rules, reported as signer_name. */
export function validateSignerName(value: unknown): string {
  return underField(() => validateContactFullName(value), 'signer_name', 'Contact full name', 'Signer name');
}

function underField(
  validate: () => string,
  field: string,
  from: string,
  to: string,
): string {
  try {
    return validate();
  } catch (error) {
    if (error instanceof OnboardingValidationError) {
      throw new OnboardingValidationError(field, error.message.replace(from, to));
    }
    throw error;
  }
}
