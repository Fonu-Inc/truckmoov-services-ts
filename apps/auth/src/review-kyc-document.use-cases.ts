import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  KYC_DOCUMENT_REPOSITORY,
  type KycDocumentQueueFilters,
  type KycDocumentRepository,
  type StoredKycDocument,
} from './tenant-kyc-document.repository';

export class KycDocumentNotFoundError extends Error {
  constructor() {
    super('KYC document not found');
  }
}

export class KycDocumentAlreadyReviewedError extends Error {
  constructor(status: string) {
    super(`KYC document has already been reviewed as ${status}`);
  }
}

export class KycRejectionReasonRequiredError extends Error {
  constructor() {
    super('A rejection reason is required');
  }
}

function present(doc: StoredKycDocument) {
  return {
    id: doc.id,
    tenantId: doc.tenantId,
    documentType: doc.documentType,
    documentName: doc.documentName,
    fileSize: doc.fileSize,
    status: doc.status,
    reviewedBy: doc.reviewedBy,
    reviewedAt: doc.reviewedAt,
    rejectionReason: doc.rejectionReason,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

@Injectable()
export class ListKycReviewQueueUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(KYC_DOCUMENT_REPOSITORY)
    private readonly kycDocumentRepository: KycDocumentRepository,
  ) {}

  async execute(accessToken: string, filters?: KycDocumentQueueFilters) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);

    const { items, total } = await this.kycDocumentRepository.findForReview(filters);

    return {
      status: true,
      message: 'success',
      data: { items: items.map(present), total },
    };
  }
}

abstract class DecideKycDocumentUseCase {
  constructor(
    protected readonly tokenService: TokenService,
    protected readonly userRepository: UserRepository,
    protected readonly kycDocumentRepository: KycDocumentRepository,
  ) {}

  protected async decide(
    accessToken: string,
    documentId: string,
    outcome: 'verified' | 'rejected',
    rejectionReason: string | null,
  ) {
    const actor = await ensureSystemActor(
      accessToken,
      this.tokenService,
      this.userRepository,
    );

    const existing = await this.kycDocumentRepository.findById(documentId);
    if (!existing) throw new KycDocumentNotFoundError();
    if (existing.status === 'verified' || existing.status === 'rejected') {
      throw new KycDocumentAlreadyReviewedError(existing.status);
    }

    const decided: StoredKycDocument = {
      ...existing,
      status: outcome,
      reviewedBy: actor.id,
      reviewedAt: new Date(),
      rejectionReason,
      updatedAt: new Date(),
    };

    await this.kycDocumentRepository.save(decided);

    return { status: true, message: 'success', data: present(decided) };
  }
}

@Injectable()
export class ApproveKycDocumentUseCase extends DecideKycDocumentUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) tokenService: TokenService,
    @Inject(USER_REPOSITORY) userRepository: UserRepository,
    @Inject(KYC_DOCUMENT_REPOSITORY) kycDocumentRepository: KycDocumentRepository,
  ) {
    super(tokenService, userRepository, kycDocumentRepository);
  }

  async execute(accessToken: string, documentId: string) {
    return this.decide(accessToken, documentId, 'verified', null);
  }
}

@Injectable()
export class RejectKycDocumentUseCase extends DecideKycDocumentUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) tokenService: TokenService,
    @Inject(USER_REPOSITORY) userRepository: UserRepository,
    @Inject(KYC_DOCUMENT_REPOSITORY) kycDocumentRepository: KycDocumentRepository,
  ) {
    super(tokenService, userRepository, kycDocumentRepository);
  }

  async execute(accessToken: string, documentId: string, reason: string) {
    const trimmed = reason?.trim();
    if (!trimmed) throw new KycRejectionReasonRequiredError();
    return this.decide(accessToken, documentId, 'rejected', trimmed);
  }
}
