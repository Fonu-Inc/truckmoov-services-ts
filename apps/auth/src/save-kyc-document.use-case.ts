import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  ForbiddenError,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  KYC_DOCUMENT_REPOSITORY,
  type KycDocumentRepository,
  type KycDocumentType,
} from './tenant-kyc-document.repository';

@Injectable()
export class SaveKycDocumentUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(KYC_DOCUMENT_REPOSITORY)
    private readonly kycDocumentRepository: KycDocumentRepository,
  ) {}

  async execute(
    accessToken: string,
    payload: {
      documentType: KycDocumentType;
      documentName: string;
      fileKey: string;
      fileSize: number;
    },
  ) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors cannot upload KYC documents');
    }

    const now = new Date();
    const doc = {
      id: randomUUID(),
      tenantId: actor.tenantId,
      documentType: payload.documentType,
      documentName: payload.documentName,
      fileKey: payload.fileKey,
      fileSize: payload.fileSize,
      status: 'pending' as const,
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.kycDocumentRepository.save(doc);

    return {
      status: true,
      message: 'success',
      data: {
        id: doc.id,
        documentType: doc.documentType,
        documentName: doc.documentName,
        fileSize: doc.fileSize,
        status: doc.status,
        createdAt: doc.createdAt,
      },
    };
  }
}
