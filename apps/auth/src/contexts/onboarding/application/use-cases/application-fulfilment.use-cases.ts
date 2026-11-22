import { Inject, Injectable } from '@nestjs/common';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type OnboardingFulfilment,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { assertApplicationEditable } from '@auth/onboarding/domain/onboarding-application.support';
import { OnboardingValidationError } from '@auth/onboarding/domain/onboarding-application.validation';
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
 * How the requested devices reach the applicant: every customer type collects
 * them from an MTN pickup point. Delivery is not offered, so it is refused.
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

    const fulfilment = await this.validated(input);
    const updated = { ...application, fulfilment, updatedAt: new Date() };
    await this.applications.save(updated);

    return {
      status: true,
      message: 'Device fulfilment saved',
      data: await loadApplicationView(this.applications, updated),
    };
  }

  private async validated(input: SetFulfilmentInput): Promise<OnboardingFulfilment> {
    if (input.method !== 'pickup') {
      throw new OnboardingValidationError('method', 'Devices are collected from an MTN pickup point; delivery is not offered');
    }
    const id = typeof input.pickupLocationId === 'string' ? input.pickupLocationId.trim() : '';
    const location = id ? await this.locations.findActiveById(id) : null;
    if (!location) throw new OnboardingValidationError('pickupLocationId', 'Choose a pickup location from the list');
    return { method: 'pickup', pickupLocationId: location.id };
  }
}
