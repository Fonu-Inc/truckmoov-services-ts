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
  INDEMNITY_AGREEMENT_REPOSITORY,
  type IndemnityAgreementRepository,
  type IndemnitySignatureMethod,
} from '@auth/onboarding/domain/indemnity-agreement.repository';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { assertApplicationEditable } from '@auth/onboarding/domain/onboarding-application.support';
import {
  OnboardingValidationError,
  validateContactFullName,
} from '@auth/onboarding/domain/onboarding-application.validation';
import {
  SIGNED_AGREEMENT_RENDERER,
  type SignedAgreementRenderer,
} from '@auth/onboarding/domain/ports/signed-agreement-renderer.port';
import { inspectSignatureFile } from '@auth/onboarding/domain/indemnity-signature-file';
import type { UploadedDocumentFile } from '@auth/onboarding/domain/onboarding-document-file';
import { loadApplicationView } from './support/load-application-view';
import { touchApplication } from './support/touch-application';
import { GetOnboardingApplicationUseCase } from './get-onboarding-application.use-case';

export class IndemnityTemplateNotFoundError extends Error {
  constructor() {
    super('No indemnity agreement is published');
    this.name = 'IndemnityTemplateNotFoundError';
  }
}

export class IndemnityTemplateSupersededError extends Error {
  constructor(signedVersion: string, activeVersion: string) {
    super(
      `This form is version ${signedVersion} but version ${activeVersion} is now in force. Read the current form and sign again.`,
    );
    this.name = 'IndemnityTemplateSupersededError';
  }
}

@Injectable()
export class GetIndemnityTemplateUseCase {
  constructor(
    @Inject(INDEMNITY_AGREEMENT_REPOSITORY)
    private readonly agreements: IndemnityAgreementRepository,
  ) {}

  async execute() {
    const template = await this.agreements.findActiveTemplate();
    if (!template) throw new IndemnityTemplateNotFoundError();

    return {
      status: true,
      message: 'success',
      data: {
        version: template.version,
        title: template.title,
        body: template.body,
      },
    };
  }
}

@Injectable()
export class SignIndemnityAgreementUseCase {
  private readonly logger = new Logger(SignIndemnityAgreementUseCase.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(INDEMNITY_AGREEMENT_REPOSITORY)
    private readonly agreements: IndemnityAgreementRepository,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
    @Inject(ObjectStorageService)
    private readonly objectStorage: ObjectStorageService,
    @Inject(SIGNED_AGREEMENT_RENDERER)
    private readonly renderer: SignedAgreementRenderer,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(input: {
    applicationId: string;
    applicationToken: string;
    signerName: unknown;
    templateVersion: unknown;
    method: unknown;
    file?: UploadedDocumentFile;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const application = await this.getApplication.resolve(
      input.applicationId,
      input.applicationToken,
    );
    assertApplicationEditable(application);

    const template = await this.agreements.findActiveTemplate();
    if (!template) throw new IndemnityTemplateNotFoundError();

    // The version the applicant read is sent back with the signature. If legal
    // published a new one while the form was open, the agreement on screen was
    // not the agreement in force, and signing it would record consent to
    // wording nobody is bound by.
    const signedVersion = String(input.templateVersion ?? '').trim();
    if (signedVersion !== template.version) {
      throw new IndemnityTemplateSupersededError(
        signedVersion || 'unknown',
        template.version,
      );
    }

    const signerName = validateContactFullName(input.signerName);
    const method = validateSignatureMethod(input.method);
    const inspected = inspectSignatureFile(input.file);
    const file = input.file as UploadedDocumentFile;

    const now = new Date();
    const signatureKey = `auth/onboarding-applications/${application.id}/indemnity-signature-${this.idGenerator.generate()}${inspected.extension}`;
    const agreementKey = `auth/onboarding-applications/${application.id}/indemnity-${template.version}-${this.idGenerator.generate()}.pdf`;

    // The mark and the readable agreement are stored separately: the image is
    // the evidence, the PDF is the copy anyone is ever handed.
    const agreementPdf = await this.renderer.render({
      title: template.title,
      body: template.body,
      templateVersion: template.version,
      templateHash: template.bodyHash,
      organizationName: application.organizationName,
      applicationReference: application.reference,
      signerName,
      signedAt: now,
      ipAddress: input.ipAddress ?? null,
      signature: { bytes: file.buffer, mimeType: inspected.mimeType },
    });

    try {
      await this.objectStorage.putObject({
        key: signatureKey,
        body: file.buffer,
        contentType: inspected.mimeType,
        visibility: 'private',
      });
      await this.objectStorage.putObject({
        key: agreementKey,
        body: agreementPdf,
        contentType: 'application/pdf',
        visibility: 'private',
      });
    } catch (error) {
      this.logger.error(
        `Indemnity signature upload failed for application ${application.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException('Signature upload failed');
    }

    const existing = await this.agreements.findSignatureByApplicationId(
      application.id,
    );

    await this.agreements.saveSignature({
      id: existing?.id ?? this.idGenerator.generate(),
      applicationId: application.id,
      templateVersion: template.version,
      templateHash: template.bodyHash,
      signerName,
      method,
      fileKey: signatureKey,
      mimeType: inspected.mimeType,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent?.slice(0, 512) ?? null,
      signedAt: now,
    });

    // Filed as a document as well so a reviewer sees the signed agreement in
    // the same list as everything else the applicant supplied.
    const documents = await this.applications.findDocumentsByApplicationId(
      application.id,
    );
    const documentRow = documents.find(
      (document) => document.documentType === 'signed_indemnity_form',
    );
    await this.applications.saveDocument({
      id: documentRow?.id ?? this.idGenerator.generate(),
      applicationId: application.id,
      vehicleId: null,
      tenantId: documentRow?.tenantId ?? null,
      documentType: 'signed_indemnity_form',
      documentName: `indemnity-agreement-${template.version}.pdf`,
      fileKey: agreementKey,
      // Hashed like any other document, but never a duplicate signal: two
      // applicants signing the same template produce different bytes because
      // the page carries their own name, time and signature.
      fileHash: createHash('sha256').update(agreementPdf).digest('hex'),
      fileSize: agreementPdf.byteLength,
      mimeType: 'application/pdf',
      status: 'pending',
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: documentRow?.createdAt ?? now,
      updatedAt: now,
    });

    await touchApplication(this.applications, application);

    return {
      status: true,
      message: 'Indemnity agreement signed',
      data: {
        signedAt: now.toISOString(),
        templateVersion: template.version,
        signerName,
        application: await loadApplicationView(this.applications, application),
      },
    };
  }
}

function validateSignatureMethod(value: unknown): IndemnitySignatureMethod {
  const candidate = String(value ?? '').trim().toLowerCase();
  if (candidate !== 'drawn' && candidate !== 'uploaded') {
    throw new OnboardingValidationError(
      'method',
      'Signature method must be drawn or uploaded',
    );
  }
  return candidate;
}
