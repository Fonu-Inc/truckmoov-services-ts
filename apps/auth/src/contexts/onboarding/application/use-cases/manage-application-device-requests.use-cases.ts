import { Inject, Injectable } from '@nestjs/common';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  assertApplicationEditable,
  requestedDeviceCount,
} from '@auth/onboarding/domain/onboarding-application.support';
import {
  OnboardingValidationError,
  validateDeviceNotes,
  validateDeviceQuantity,
  validateDeviceUseCase,
} from '@auth/onboarding/domain/onboarding-application.validation';
import { loadApplicationView } from './support/load-application-view';
import { touchApplication } from './support/touch-application';
import { GetOnboardingApplicationUseCase } from './get-onboarding-application.use-case';

export class DeviceRequestNotFoundError extends Error {
  constructor() {
    super('Device request not found');
    this.name = 'DeviceRequestNotFoundError';
  }
}

@Injectable()
export class RequestApplicationDevicesUseCase {
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
    quantity: unknown;
    useCase: unknown;
    notes?: unknown;
  }) {
    const application = await this.getApplication.resolve(
      input.applicationId,
      input.applicationToken,
    );
    assertApplicationEditable(application);

    const quantity = validateDeviceQuantity(input.quantity);
    const [vehicles, requests] = await Promise.all([
      this.applications.findVehiclesByApplicationId(application.id),
      this.applications.findDeviceRequestsByApplicationId(application.id),
    ]);

    // Each device is fitted to one vehicle, so the fleet on the application is
    // the ceiling. Checked here as well as at submit so the applicant is told
    // at the point of asking rather than at the end of the flow.
    const total = requestedDeviceCount(requests) + quantity;
    if (total > vehicles.length) {
      throw new OnboardingValidationError(
        'quantity',
        `Only ${vehicles.length} vehicle(s) have been added, so at most ${vehicles.length} device(s) can be requested`,
      );
    }

    const now = new Date();
    await this.applications.saveDeviceRequest({
      id: this.idGenerator.generate(),
      applicationId: application.id,
      quantity,
      useCase: validateDeviceUseCase(input.useCase),
      notes: validateDeviceNotes(input.notes),
      createdAt: now,
      updatedAt: now,
    });

    await touchApplication(this.applications, application);

    return {
      status: true,
      message: 'Device request submitted',
      data: await loadApplicationView(this.applications, application),
    };
  }
}

@Injectable()
export class RemoveApplicationDeviceRequestUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
  ) {}

  async execute(input: {
    applicationId: string;
    applicationToken: string;
    requestId: string;
  }) {
    const application = await this.getApplication.resolve(
      input.applicationId,
      input.applicationToken,
    );
    assertApplicationEditable(application);

    const request = await this.applications.findDeviceRequestById(
      input.requestId,
    );
    if (!request || request.applicationId !== application.id) {
      throw new DeviceRequestNotFoundError();
    }

    await this.applications.deleteDeviceRequest(request.id);

    await touchApplication(this.applications, application);

    return {
      status: true,
      message: 'Device request removed',
      data: await loadApplicationView(this.applications, application),
    };
  }
}
