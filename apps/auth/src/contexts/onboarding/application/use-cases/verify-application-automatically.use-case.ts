import { Inject, Injectable, Logger } from '@nestjs/common';
import { ObjectStorageService } from '@shared/object-storage';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  decideAutomatically,
  type AutomatedDecision,
} from '@auth/onboarding/domain/automated-decision';
import { findContradictionsBeforeApproval } from './support/check-document-contradictions';
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
  DOCUMENT_EXTRACTOR,
  type DocumentExtractor,
} from '@auth/onboarding/domain/ports/document-extraction.port';
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
    @Inject(DOCUMENT_EXTRACTOR) private readonly extractor: DocumentExtractor,
    @Inject(ObjectStorageService)
    private readonly storage: ObjectStorageService,
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

    let decision = decideAutomatically(application.applicantType, checks);

    // Reading the documents costs the applicant real time, so it happens only
    // where it could change the answer: at the point the registries would
    // otherwise approve.
    if (decision.outcome === 'approve') {
      const contradictions = await findContradictionsBeforeApproval(
        this.applications,
        this.extractor,
        this.storage,
        application,
      );
      decision = decideAutomatically(
        application.applicantType,
        checks,
        contradictions.map(
          (entry) =>
            `${entry.field} reads ${entry.read} on the document, not ${entry.claimed}`,
        ),
      );
    }
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

    const vehicles = await this.licensedVehicles(application.id);
    // Each licence is checked against the registry under its own plate, so a
    // fleet cannot pass on the strength of one vehicle that is genuinely theirs.
    for (const vehicle of vehicles) {
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

  /**
   * Vehicles the applicant has filed a licence for. A vehicle with no licence
   * has nothing to check yet, and the submit gate already refuses an
   * application with one missing.
   */
  private async licensedVehicles(applicationId: string) {
    const [vehicles, documents] = await Promise.all([
      this.applications.findVehiclesByApplicationId(applicationId),
      this.applications.findDocumentsByApplicationId(applicationId),
    ]);
    const licensed = new Set(
      documents
        .filter((document) => document.documentType === 'vehicle_license')
        .map((document) => document.vehicleId),
    );
    return vehicles.filter((vehicle) => licensed.has(vehicle.id));
  }
}
