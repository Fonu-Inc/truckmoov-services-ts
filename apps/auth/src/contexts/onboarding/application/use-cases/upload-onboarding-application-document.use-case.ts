import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ObjectStorageService } from '@shared/object-storage';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  IDENTITY_CLAIM_REPOSITORY,
  type IdentityClaimRepository,
} from '@auth/onboarding/domain/identity-claim.repository';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type OnboardingDocumentType,
  type StoredOnboardingApplicationDocument,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  applicationDocumentKey,
  assertApplicationEditable,
  isPerVehicleDocument,
} from '@auth/onboarding/domain/onboarding-application.support';
import { OnboardingValidationError } from '@auth/onboarding/domain/onboarding-application.validation';
import { enforceIdentityClaims } from './support/enforce-identity-claims';
import { loadApplicationView } from './support/load-application-view';
import { touchApplication } from './support/touch-application';
import {
  inspectDocumentFile,
  validateDocumentType,
  type UploadedDocumentFile,
} from '@auth/onboarding/domain/onboarding-document-file';
import { GetOnboardingApplicationUseCase } from './get-onboarding-application.use-case';

@Injectable()
export class UploadOnboardingApplicationDocumentUseCase {
  private readonly logger = new Logger(
    UploadOnboardingApplicationDocumentUseCase.name,
  );

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ObjectStorageService)
    private readonly objectStorage: ObjectStorageService,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
    @Inject(IDENTITY_CLAIM_REPOSITORY)
    private readonly identityClaims: IdentityClaimRepository,
  ) {}

  async execute(input: {
    applicationId: string;
    applicationToken: string;
    documentType: unknown;
    vehicleId?: string;
    file?: UploadedDocumentFile;
  }) {
    const application = await this.getApplication.resolve(
      input.applicationId,
      input.applicationToken,
    );
    assertApplicationEditable(application);

    const documentType = validateDocumentType(input.documentType);
    const vehicleId = await this.resolveVehicle(
      application.id,
      documentType,
      input.vehicleId,
    );
    const inspected = inspectDocumentFile(documentType, input.file);
    const file = input.file as UploadedDocumentFile;

    const key = applicationDocumentKey(
      application.id,
      documentType,
      inspected.extension,
    );

    try {
      await this.objectStorage.putObject({
        key,
        body: file.buffer,
        // The sniffed type is stored, not the caller's: a mislabelled upload
        // must not be served back with the label it arrived under.
        contentType: inspected.mimeType,
        visibility: 'private',
      });
    } catch (error) {
      this.logger.error(
        `Onboarding document upload failed for application ${application.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('File upload failed');
    }

    const existing = await this.findExistingDocument(
      application.id,
      documentType,
      vehicleId,
    );
    const now = new Date();
    const document: StoredOnboardingApplicationDocument = {
      id: existing?.id ?? this.idGenerator.generate(),
      applicationId: application.id,
      // Ownership is stamped at approval. Documents stay in the platform's own
      // storage prefix for life, so this column is the only owner record.
      tenantId: existing?.tenantId ?? null,
      vehicleId,
      documentType,
      documentName: inspected.documentName,
      fileKey: key,
      fileHash: createHash('sha256').update(file.buffer).digest('hex'),
      fileSize: file.buffer.byteLength,
      mimeType: inspected.mimeType,
      // A replacement re-enters review even if the previous file was rejected.
      status: 'pending',
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this.applications.saveDocument(document);

    if (existing && existing.fileKey !== key) {
      await this.removeReplacedObject(existing.fileKey);
    }

    const documents = await this.applications.findDocumentsByApplicationId(
      application.id,
    );

    // After the row is written, so the check sees the file that was just
    // filed; a conflict throws and the applicant is told which detail clashes.
    await enforceIdentityClaims(
      this.identityClaims,
      this.applications,
      application,
    );
    await touchApplication(this.applications, application);

    return {
      status: true,
      message: 'Document uploaded',
      data: await loadApplicationView(this.applications, application),
    };
  }

  /**
   * A per-vehicle document must name its vehicle; an application-wide one must
   * not. Without both halves a licence could be filed against the application
   * and pass a gate that is counting licences per vehicle.
   */
  private async resolveVehicle(
    applicationId: string,
    documentType: OnboardingDocumentType,
    vehicleId?: string,
  ): Promise<string | null> {
    if (!isPerVehicleDocument(documentType)) {
      if (vehicleId) {
        throw new OnboardingValidationError(
          'vehicleId',
          `${documentType} is not uploaded per vehicle`,
        );
      }
      return null;
    }

    if (!vehicleId) {
      throw new OnboardingValidationError(
        'vehicleId',
        `${documentType} must be uploaded against a vehicle`,
      );
    }

    const vehicle = await this.applications.findVehicleById(vehicleId);
    if (!vehicle || vehicle.applicationId !== applicationId) {
      throw new OnboardingValidationError('vehicleId', 'Vehicle not found');
    }
    return vehicle.id;
  }

  private async findExistingDocument(
    applicationId: string,
    documentType: string,
    vehicleId: string | null,
  ): Promise<StoredOnboardingApplicationDocument | null> {
    const documents =
      await this.applications.findDocumentsByApplicationId(applicationId);
    return (
      documents.find(
        (document) =>
          document.documentType === documentType &&
          document.vehicleId === vehicleId,
      ) ?? null
    );
  }

  private async removeReplacedObject(fileKey: string): Promise<void> {
    try {
      await this.objectStorage.deleteObject(fileKey, 'private');
    } catch (error) {
      // The row already points at the new object, so a failed cleanup leaves an
      // orphaned file rather than a broken application.
      this.logger.warn(
        `Failed to delete replaced onboarding document ${fileKey}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
