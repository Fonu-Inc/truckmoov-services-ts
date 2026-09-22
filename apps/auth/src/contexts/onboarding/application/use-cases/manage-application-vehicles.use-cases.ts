import { Inject, Injectable } from '@nestjs/common';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplicationVehicle,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { assertApplicationEditable } from '@auth/onboarding/domain/onboarding-application.support';
import {
  OnboardingValidationError,
  validateOdometerReading,
  validateRegistrationNumber,
  validateVehiclePurchaseType,
  validateVehicleTextField,
  validateVehicleType,
  validateVehicleYear,
} from '@auth/onboarding/domain/onboarding-application.validation';
import {
  parseOnboardingVehicleCsv,
  type OnboardingVehicleCsvRow,
} from '@auth/onboarding/domain/onboarding-vehicle-csv';
import { loadApplicationView } from './support/load-application-view';
import { touchApplication } from './support/touch-application';
import { GetOnboardingApplicationUseCase } from './get-onboarding-application.use-case';

export class VehicleNotFoundError extends Error {
  constructor() {
    super('Vehicle not found');
    this.name = 'VehicleNotFoundError';
  }
}

export class DuplicateVehicleError extends Error {
  constructor(registrationNumber: string) {
    super(`${registrationNumber} has already been added to this application`);
    this.name = 'DuplicateVehicleError';
  }
}

export type VehicleCommand = {
  registrationNumber: unknown;
  vehicleType: unknown;
  make: unknown;
  model: unknown;
  year?: unknown;
  engineNumber?: unknown;
  chassisNumber?: unknown;
  color?: unknown;
  engineCapacity?: unknown;
  odometerReading?: unknown;
  purchaseType?: unknown;
  purchaseTypeOther?: unknown;
};

@Injectable()
export class AddApplicationVehicleUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(input: {
    applicationId: string;
    applicationToken: string;
    vehicle: VehicleCommand;
  }) {
    const application = await this.getApplication.resolve(
      input.applicationId,
      input.applicationToken,
    );
    assertApplicationEditable(application);

    const details = validateVehicleDetails(input.vehicle);
    const clash = await this.applications.findVehicleByRegistration(
      application.id,
      details.registrationNumber,
    );
    if (clash) throw new DuplicateVehicleError(details.registrationNumber);

    const now = new Date();
    await this.applications.saveVehicle({
      id: this.idGenerator.generate(),
      applicationId: application.id,
      ...details,
      createdAt: now,
      updatedAt: now,
    });

    await touchApplication(this.applications, application);

    return {
      status: true,
      message: 'Vehicle added',
      data: await loadApplicationView(this.applications, application),
    };
  }
}

@Injectable()
export class UpdateApplicationVehicleUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
  ) {}

  async execute(input: {
    applicationId: string;
    applicationToken: string;
    vehicleId: string;
    vehicle: VehicleCommand;
  }) {
    const application = await this.getApplication.resolve(
      input.applicationId,
      input.applicationToken,
    );
    assertApplicationEditable(application);

    const existing = await this.resolveVehicle(application.id, input.vehicleId);
    const details = validateVehicleDetails(input.vehicle);

    if (details.registrationNumber !== existing.registrationNumber) {
      const clash = await this.applications.findVehicleByRegistration(
        application.id,
        details.registrationNumber,
      );
      if (clash) throw new DuplicateVehicleError(details.registrationNumber);
    }

    await this.applications.saveVehicle({
      ...existing,
      ...details,
      updatedAt: new Date(),
    });

    await touchApplication(this.applications, application);

    return {
      status: true,
      message: 'Vehicle updated',
      data: await loadApplicationView(this.applications, application),
    };
  }

  private async resolveVehicle(
    applicationId: string,
    vehicleId: string,
  ): Promise<StoredOnboardingApplicationVehicle> {
    const vehicle = await this.applications.findVehicleById(vehicleId);
    if (!vehicle || vehicle.applicationId !== applicationId) {
      throw new VehicleNotFoundError();
    }
    return vehicle;
  }
}

@Injectable()
export class RemoveApplicationVehicleUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
  ) {}

  async execute(input: {
    applicationId: string;
    applicationToken: string;
    vehicleId: string;
  }) {
    const application = await this.getApplication.resolve(
      input.applicationId,
      input.applicationToken,
    );
    assertApplicationEditable(application);

    const vehicle = await this.applications.findVehicleById(input.vehicleId);
    if (!vehicle || vehicle.applicationId !== application.id) {
      throw new VehicleNotFoundError();
    }

    // Removing the vehicle takes its licence with it: a document filed against
    // a vehicle that no longer exists can never be reviewed or matched.
    await this.applications.deleteVehicle(vehicle.id);

    await touchApplication(this.applications, application);

    return {
      status: true,
      message: 'Vehicle removed',
      data: await loadApplicationView(this.applications, application),
    };
  }
}

@Injectable()
export class ImportApplicationVehiclesUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(input: {
    applicationId: string;
    applicationToken: string;
    content: string;
  }) {
    const application = await this.getApplication.resolve(
      input.applicationId,
      input.applicationToken,
    );
    assertApplicationEditable(application);

    const parsed = parseOnboardingVehicleCsv(input.content);
    const existing = await this.applications.findVehiclesByApplicationId(
      application.id,
    );
    const byRegistration = new Map(
      existing.map((vehicle) => [vehicle.registrationNumber, vehicle]),
    );

    let created = 0;
    let updated = 0;
    const now = new Date();

    for (const row of parsed.rows) {
      const match = byRegistration.get(row.registrationNumber);
      // A re-upload of the same file corrects rows rather than duplicating the
      // fleet, so the registration is what identifies a vehicle, not the row.
      await this.applications.saveVehicle(
        match
          ? { ...match, ...toVehicleFields(row), updatedAt: now }
          : {
              id: this.idGenerator.generate(),
              applicationId: application.id,
              ...toVehicleFields(row),
              createdAt: now,
              updatedAt: now,
            },
      );
      if (match) updated += 1;
      else created += 1;
    }

    await touchApplication(this.applications, application);

    return {
      status: true,
      message: `${created} vehicle(s) added, ${updated} updated`,
      data: {
        created,
        updated,
        skipped: parsed.errors,
        application: await loadApplicationView(this.applications, application),
      },
    };
  }
}

function toVehicleFields(row: OnboardingVehicleCsvRow) {
  return {
    registrationNumber: row.registrationNumber,
    vehicleType: row.vehicleType,
    make: row.make,
    model: row.model,
    year: row.year,
    engineNumber: row.engineNumber,
    chassisNumber: row.chassisNumber,
    color: row.color,
    engineCapacity: row.engineCapacity,
    odometerReading: row.odometerReading,
    purchaseType: row.purchaseType,
    purchaseTypeOther: row.purchaseTypeOther,
  };
}

export function validateVehicleDetails(command: VehicleCommand) {
  const purchaseType = validateVehiclePurchaseType(command.purchaseType);
  const purchaseTypeOther = validateVehicleTextField(
    'purchaseTypeOther',
    'Purchase type detail',
    command.purchaseTypeOther,
    { required: false, max: 120 },
  );
  if (purchaseType === 'other' && purchaseTypeOther === null) {
    throw new OnboardingValidationError(
      'purchaseTypeOther',
      'Purchase type detail is required when purchase type is other',
    );
  }

  return {
    registrationNumber: validateRegistrationNumber(command.registrationNumber),
    vehicleType: validateVehicleType(command.vehicleType),
    make: requireVehicleText('make', 'Make', command.make, 80),
    model: requireVehicleText('model', 'Model', command.model, 80),
    year: validateVehicleYear(command.year),
    engineNumber: validateVehicleTextField('engineNumber', 'Engine number', command.engineNumber, { required: false, max: 64 }),
    chassisNumber: validateVehicleTextField('chassisNumber', 'Chassis number', command.chassisNumber, { required: false, max: 64 }),
    color: validateVehicleTextField('color', 'Colour', command.color, { required: false, max: 40 }),
    engineCapacity: validateVehicleTextField('engineCapacity', 'Engine capacity', command.engineCapacity, { required: false, max: 32 }),
    odometerReading: validateOdometerReading(command.odometerReading),
    purchaseType,
    purchaseTypeOther,
  };
}

function requireVehicleText(
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
