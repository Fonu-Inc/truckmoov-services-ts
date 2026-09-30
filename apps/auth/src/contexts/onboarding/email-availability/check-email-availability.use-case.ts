import { Inject, Injectable } from '@nestjs/common';
import { USER_REPOSITORY } from '@auth/session';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { validateBusinessEmail } from '@auth/onboarding/domain/onboarding-application.validation';
import { EmailBloomService } from './email-bloom.service';

/**
 * Answers while the applicant is still typing. The filter settles the common
 * case, an address nobody has used, without a query; a "maybe" is confirmed
 * with the same two lookups the save runs, which stays the final check.
 */
@Injectable()
export class CheckEmailAvailabilityUseCase {
  constructor(
    @Inject(EmailBloomService) private readonly bloom: EmailBloomService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
  ) {}

  async execute(rawEmail: unknown, ownApplicationId?: string) {
    const email = validateBusinessEmail(rawEmail);
    const available = !(await this.bloom.mightContain(email)) || !(await this.isTaken(email, ownApplicationId));
    return { status: true, message: 'success', data: { available } };
  }

  private async isTaken(email: string, ownApplicationId?: string): Promise<boolean> {
    if (await this.users.findByEmail(email)) return true;
    const live = await this.applications.findLiveByBusinessEmail(email);
    return live !== null && live.id !== ownApplicationId;
  }
}
