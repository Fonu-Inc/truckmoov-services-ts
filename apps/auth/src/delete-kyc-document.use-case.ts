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

export class KycDocumentNotFoundError extends Error {}

@Injectable()
export class DeleteKycDocumentUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(KYC_DOCUMENT_REPOSITORY)
    private readonly kycDocumentRepository: KycDocumentRepository,
  ) {}

  async execute(accessToken: string, docId: string) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );

    const doc = await this.kycDocumentRepository.findById(docId);
    if (!doc || doc.tenantId !== actor.tenantId) {
      throw new KycDocumentNotFoundError('KYC document not found');
    }

    await this.kycDocumentRepository.delete(docId);

    return { status: true, message: 'success', data: null };
  }
}
