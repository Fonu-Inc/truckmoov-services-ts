import { Inject, Injectable } from '@nestjs/common';
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
} from './tenant-kyc-document.repository';

@Injectable()
export class ListKycDocumentsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(KYC_DOCUMENT_REPOSITORY)
    private readonly kycDocumentRepository: KycDocumentRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors do not have KYC documents');
    }

    const docs = await this.kycDocumentRepository.findAllByTenantId(
      actor.tenantId,
    );

    return {
      status: true,
      message: 'success',
      data: {
        documents: docs.map((d) => ({
          id: d.id,
          documentType: d.documentType,
          documentName: d.documentName,
          fileSize: d.fileSize,
          status: d.status,
          createdAt: d.createdAt,
        })),
      },
    };
  }
}
