import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ObjectStorageService } from '@shared/object-storage';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplicationDocument,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  applicationDocumentKey,
  assertApplicationEditable,
  toApplicationView,
} from '@auth/onboarding/domain/onboarding-application.support';
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
  ) {}

  async execute(input: {
    applicationId: string;
    applicationToken: string;
    documentType: unknown;
    file?: UploadedDocumentFile;
  }) {
    const application = await this.getApplication.resolve(
      input.applicationId,
      input.applicationToken,
    );
    assertApplicationEditable(application);

    const documentType = validateDocumentType(input.documentType);
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
    );
    const now = new Date();
    const document: StoredOnboardingApplicationDocument = {
      id: existing?.id ?? this.idGenerator.generate(),
      applicationId: application.id,
      // Ownership is stamped at approval. Documents stay in the platform's own
      // storage prefix for life, so this column is the only owner record.
      tenantId: existing?.tenantId ?? null,
      documentType,
      documentName: inspected.documentName,
      fileKey: key,
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

    return {
      status: true,
      message: 'Document uploaded',
      data: toApplicationView(application, documents),
    };
  }

  private async findExistingDocument(
    applicationId: string,
    documentType: string,
  ): Promise<StoredOnboardingApplicationDocument | null> {
    const documents =
      await this.applications.findDocumentsByApplicationId(applicationId);
    return (
      documents.find((document) => document.documentType === documentType) ??
      null
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
