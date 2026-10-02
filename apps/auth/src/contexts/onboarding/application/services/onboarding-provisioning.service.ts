import { Inject, Injectable } from '@nestjs/common';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { requestedDeviceCount } from '@auth/onboarding/domain/onboarding-application.support';
import { assertStageAdvance } from '@auth/onboarding/domain/onboarding-stage';
import { ApplicationPaymentNoticeService } from './application-payment-notice.service';
import { OnboardingDeviceInventoryService } from './onboarding-device-inventory.service';

@Injectable()
export class OnboardingProvisioningService {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(OnboardingDeviceInventoryService)
    private readonly inventory: OnboardingDeviceInventoryService,
    @Inject(ApplicationPaymentNoticeService)
    private readonly notices: ApplicationPaymentNoticeService,
  ) {}

  async stockCovers(application: StoredOnboardingApplication): Promise<boolean> {
    const requests = await this.applications.findDeviceRequestsByApplicationId(
      application.id,
    );
    const stock = await this.inventory.availability();
    return !stock.tracked || requestedDeviceCount(requests) <= stock.availableQuantity;
  }

  async openPayment(
    application: StoredOnboardingApplication,
    now: Date = new Date(),
  ): Promise<StoredOnboardingApplication> {
    assertStageAdvance(application.stage, 'payment');
    const advanced = { ...application, stage: 'payment' as const, updatedAt: now };
    await this.applications.save(advanced);
    await this.notices.paymentOpened(advanced, now);
    return advanced;
  }
}
