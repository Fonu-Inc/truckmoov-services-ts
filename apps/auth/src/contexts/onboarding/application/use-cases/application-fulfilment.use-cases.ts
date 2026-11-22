import { Inject, Injectable } from '@nestjs/common';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type OnboardingFulfilment,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { assertApplicationEditable } from '@auth/onboarding/domain/onboarding-application.support';
import {
  OnboardingValidationError,
  validateCity,
  validateState,
  validateStreetAddress,
} from '@auth/onboarding/domain/onboarding-application.validation';
import {
  PICKUP_LOCATION_REPOSITORY,
  type PickupLocationRepository,
} from '@auth/onboarding/domain/pickup-location.repository';
import { GetOnboardingApplicationUseCase } from './get-onboarding-application.use-case';
import { loadApplicationView } from './support/load-application-view';

/** The MTN pickup points an applicant can choose from; public, as the form shows them before sign-in. */
@Injectable()
export class ListPickupLocationsUseCase {
  constructor(@Inject(PICKUP_LOCATION_REPOSITORY) private readonly locations: PickupLocationRepository) {}

  async execute() {
    return { status: true, message: 'success', data: await this.locations.listActive() };
  }
}

export type SetFulfilmentInput = {
  applicationId: string;
  applicationToken: string;
  method: unknown;
  pickupLocationId?: unknown;
  deliveryStreet?: unknown;
  deliveryCity?: unknown;
  deliveryState?: unknown;
};

/**
 * How the requested devices reach the applicant. Owner-Operators always collect
 * from a pickup point; Enterprise customers choose pickup or delivery.
 */
@Injectable()
export class SetApplicationFulfilmentUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY) private readonly applications: OnboardingApplicationRepository,
    @Inject(GetOnboardingApplicationUseCase) private readonly getApplication: GetOnboardingApplicationUseCase,
    @Inject(PICKUP_LOCATION_REPOSITORY) private readonly locations: PickupLocationRepository,
  ) {}

  async execute(input: SetFulfilmentInput) {
    const application = await this.getApplication.resolve(input.applicationId, input.applicationToken);
    assertApplicationEditable(application);

    const fulfilment = await this.validated(input, application.applicantType);
    const updated = { ...application, fulfilment, updatedAt: new Date() };
    await this.applications.save(updated);

    return {
      status: true,
      message: 'Device fulfilment saved',
      data: await loadApplicationView(this.applications, updated),
    };
  }

  private async validated(input: SetFulfilmentInput, applicantType: string): Promise<OnboardingFulfilment> {
    if (input.method !== 'pickup' && input.method !== 'delivery') {
      throw new OnboardingValidationError('method', 'Method must be pickup or delivery');
    }
    if (input.method === 'delivery') {
      if (applicantType === 'owner_operator') {
        throw new OnboardingValidationError('method', 'Owner-Operators collect their devices from a pickup point');
      }
      return {
        method: 'delivery',
        deliveryStreet: validateStreetAddress(input.deliveryStreet, 'deliveryStreet'),
        deliveryCity: asField('deliveryCity', () => validateCity(input.deliveryCity)),
        deliveryState: asField('deliveryState', () => validateState(input.deliveryState)),
      };
    }
    const id = typeof input.pickupLocationId === 'string' ? input.pickupLocationId.trim() : '';
    const location = id ? await this.locations.findActiveById(id) : null;
    if (!location) throw new OnboardingValidationError('pickupLocationId', 'Choose a pickup location from the list');
    return { method: 'pickup', pickupLocationId: location.id };
  }
}

/** The shared address checks name the business-address field; here the error belongs to the delivery field. */
function asField<T>(field: string, check: () => T): T {
  try {
    return check();
  } catch (error) {
    if (error instanceof OnboardingValidationError) throw new OnboardingValidationError(field, error.message);
    throw error;
  }
}
