import {
  buildCsvTemplate,
  parseCsvRecords,
  type CsvColumn,
  type CsvRecordParseResult,
} from '@shared/csv';
import {
  ONBOARDING_VEHICLE_PURCHASE_TYPES,
  ONBOARDING_VEHICLE_TYPES,
} from './onboarding-application.repository';
import {
  OnboardingValidationError,
  validateOdometerReading,
  validateRegistrationNumber,
  validateVehiclePurchaseType,
  validateVehicleTextField,
  validateVehicleType,
  validateVehicleYear,
} from './onboarding-application.validation';

export type OnboardingVehicleCsvRow = {
  registrationNumber: string;
  vehicleType: ReturnType<typeof validateVehicleType>;
  make: string;
  model: string;
  year: number | null;
  engineNumber: string | null;
  chassisNumber: string | null;
  color: string | null;
  engineCapacity: string | null;
  odometerReading: number | null;
  purchaseType: ReturnType<typeof validateVehiclePurchaseType>;
  purchaseTypeOther: string | null;
};

// The applicant downloads this template and uploads it back filled in, so the
// column list is the contract for both directions and lives in one place.
export const ONBOARDING_VEHICLE_CSV_COLUMNS: readonly CsvColumn[] = [
  {
    header: 'registration_number',
    required: true,
    example: 'LAG-123-ABC',
    note: 'The plate the vehicle is registered under.',
  },
  {
    header: 'vehicle_type',
    required: true,
    example: 'truck',
    note: `One of: ${ONBOARDING_VEHICLE_TYPES.join(', ')}.`,
  },
  { header: 'make', required: true, example: 'Toyota', note: '' },
  { header: 'model', required: true, example: 'Hilux', note: '' },
  { header: 'year', required: false, example: '2021', note: 'Four digits, 1950 or later.' },
  { header: 'engine_number', required: false, example: 'ENG-000123', note: '' },
  { header: 'chassis_number', required: false, example: 'JTEBU5JR9', note: '' },
  { header: 'color', required: false, example: 'White', note: '' },
  { header: 'engine_capacity', required: false, example: '2.8L', note: '' },
  {
    header: 'odometer_reading',
    required: false,
    example: '84500',
    note: 'Whole kilometres.',
  },
  {
    header: 'purchase_type',
    required: false,
    example: 'outright',
    note: `One of: ${ONBOARDING_VEHICLE_PURCHASE_TYPES.join(', ')}.`,
  },
  {
    header: 'purchase_type_other',
    required: false,
    example: '',
    note: 'Required only when purchase_type is other.',
  },
];

export class VehicleCsvEmptyError extends Error {
  constructor() {
    super('The uploaded file has no rows');
    this.name = 'VehicleCsvEmptyError';
  }
}

export class VehicleCsvColumnsMissingError extends Error {
  constructor(missing: string[]) {
    super(`The uploaded file is missing these columns: ${missing.join(', ')}`);
    this.name = 'VehicleCsvColumnsMissingError';
  }
}

export function buildOnboardingVehicleCsvTemplate(): string {
  return buildCsvTemplate(ONBOARDING_VEHICLE_CSV_COLUMNS);
}

export function parseOnboardingVehicleCsv(
  content: string,
): CsvRecordParseResult<OnboardingVehicleCsvRow> {
  return parseCsvRecords<OnboardingVehicleCsvRow>(
    content,
    ONBOARDING_VEHICLE_CSV_COLUMNS,
    toVehicleRow,
    (missing) => new VehicleCsvColumnsMissingError(missing),
    () => new VehicleCsvEmptyError(),
  );
}

function toVehicleRow(record: Record<string, string>): OnboardingVehicleCsvRow {
  const purchaseType = validateVehiclePurchaseType(record.purchase_type);
  const purchaseTypeOther = validateVehicleTextField(
    'purchaseTypeOther',
    'Purchase type detail',
    record.purchase_type_other,
    { required: false, max: 120 },
  );
  if (purchaseType === 'other' && purchaseTypeOther === null) {
    throw new OnboardingValidationError(
      'purchaseTypeOther',
      'Purchase type detail is required when purchase type is other',
    );
  }

  return {
    registrationNumber: validateRegistrationNumber(record.registration_number),
    vehicleType: validateVehicleType(record.vehicle_type),
    make: requireText('make', 'Make', record.make, 80),
    model: requireText('model', 'Model', record.model, 80),
    year: validateVehicleYear(record.year),
    engineNumber: validateVehicleTextField('engineNumber', 'Engine number', record.engine_number, { required: false, max: 64 }),
    chassisNumber: validateVehicleTextField('chassisNumber', 'Chassis number', record.chassis_number, { required: false, max: 64 }),
    color: validateVehicleTextField('color', 'Colour', record.color, { required: false, max: 40 }),
    engineCapacity: validateVehicleTextField('engineCapacity', 'Engine capacity', record.engine_capacity, { required: false, max: 32 }),
    odometerReading: validateOdometerReading(record.odometer_reading),
    purchaseType,
    purchaseTypeOther,
  };
}

function requireText(
  field: string,
  label: string,
  value: unknown,
  max: number,
): string {
  const text = validateVehicleTextField(field, label, value, {
    required: true,
    max,
  });
  if (text === null) {
    throw new OnboardingValidationError(field, `${label} is required`);
  }
  return text;
}
