import { Inject, Injectable, Logger } from '@nestjs/common';
import { ObjectStorageService } from '@shared/object-storage';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  ApplicationNotFoundError,
  assertApplicationEditable,
} from '@auth/onboarding/domain/onboarding-application.support';
import { loadApplicationView } from './support/load-application-view';
import { touchApplication } from './support/touch-application';
import { GetOnboardingApplicationUseCase } from './get-onboarding-application.use-case';

@Injectable()
export class DeleteOnboardingApplicationDocumentUseCase {
  private readonly logger = new Logger(
    DeleteOnboardingApplicationDocumentUseCase.name,
  );

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ObjectStorageService)
    private readonly objectStorage: ObjectStorageService,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
  ) {}

  async execute(input: {
    applicationId: string;
    applicationToken: string;
    documentId: string;
  }) {
    const application = await this.getApplication.resolve(
      input.applicationId,
      input.applicationToken,
    );
    assertApplicationEditable(application);

    const document = await this.applications.findDocumentById(input.documentId);
    if (!document || document.applicationId !== application.id) {
      throw new ApplicationNotFoundError();
    }

    await this.applications.deleteDocument(document.id);

    try {
      await this.objectStorage.deleteObject(document.fileKey, 'private');
    } catch (error) {
      this.logger.warn(
        `Failed to delete onboarding document object ${document.fileKey}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    const documents = await this.applications.findDocumentsByApplicationId(
      application.id,
    );

    await touchApplication(this.applications, application);

    return {
      status: true,
      message: 'Document removed',
      data: await loadApplicationView(this.applications, application),
    };
  }
}
