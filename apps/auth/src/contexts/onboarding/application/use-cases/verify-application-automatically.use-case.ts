import { Inject, Injectable, Logger } from '@nestjs/common';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  decideAutomatically,
  type AutomatedDecision,
} from '@auth/onboarding/domain/automated-decision';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  KYB_VERIFICATION,
  type KybCheckResult,
  type KybVerification,
} from '@auth/onboarding/domain/ports/kyb-verification.port';
import {
  VERIFICATION_RESULT_REPOSITORY,
  type StoredVerificationResult,
  type VerificationResultRepository,
} from '@auth/onboarding/domain/verification-result.repository';

@Injectable()
export class VerifyApplicationAutomaticallyUseCase {
  private readonly logger = new Logger(VerifyApplicationAutomaticallyUseCase.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(KYB_VERIFICATION) private readonly registries: KybVerification,
    @Inject(VERIFICATION_RESULT_REPOSITORY)
    private readonly results: VerificationResultRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  /**
   * Asks every registry the application has identifiers for, keeps the answers
   * and says what they add up to.
   *
   * Deciding is left to the caller: this runs the checks and records them,
   * which is also what makes it safe to re-run on an application a reviewer is
   * already looking at.
   */
  async execute(
    application: StoredOnboardingApplication,
  ): Promise<{ decision: AutomatedDecision; results: KybCheckResult[] }> {
    const checks = await this.runChecks(application);

    const stored: StoredVerificationResult[] = checks.map((result) => ({
      ...result,
      id: this.idGenerator.generate(),
      applicationId: application.id,
    }));
    await this.results.replaceForApplication(application.id, stored);

    const decision = decideAutomatically(application.applicantType, checks);
    this.logger.log(
      `application_verified:${application.reference}:${decision.outcome}:checks=${checks.length}`,
    );
    return { decision, results: checks };
  }

  private async runChecks(
    application: StoredOnboardingApplication,
  ): Promise<KybCheckResult[]> {
    const checks: Promise<KybCheckResult>[] = [];

    // Only identifiers the applicant actually supplied are asked about. A
    // field left blank produces no result, which reads as an unchecked
    // requirement and routes to a human — never as a pass.
    if (application.rcNumber) {
      checks.push(
        this.registries.verifyCacRegistration({
          rcNumber: application.rcNumber,
          organizationName: application.organizationName,
        }),
      );
    }
    if (application.taxIdentificationNumber) {
      checks.push(
        this.registries.verifyTaxIdentification({
          taxIdentificationNumber: application.taxIdentificationNumber,
          organizationName: application.organizationName,
        }),
      );
    }
    if (application.identificationType && application.identificationNumber) {
      checks.push(
        this.registries.verifyIdentity({
          identificationType: application.identificationType,
          identificationNumber: application.identificationNumber,
          contactFullName: application.contactFullName,
        }),
      );
    }

    const vehicle = await this.firstVehicle(application.id);
    if (vehicle) {
      // One vehicle, not all of them: the plate lookup is metered per call and
      // the question being answered is whether this fleet belongs to this
      // applicant, which one registered vehicle answers. Whole-fleet
      // verification belongs at installation, against the devices fitted.
      checks.push(
        this.registries.verifyVehicleRegistration({
          registrationNumber: vehicle.registrationNumber,
          chassisNumber: vehicle.chassisNumber,
          expectedOwnerName:
            application.applicantType === 'owner_operator'
              ? application.contactFullName
              : application.organizationName,
        }),
      );
    }

    return Promise.all(checks);
  }

  private async firstVehicle(applicationId: string) {
    const vehicles =
      await this.applications.findVehiclesByApplicationId(applicationId);
    return vehicles[0] ?? null;
  }
}
