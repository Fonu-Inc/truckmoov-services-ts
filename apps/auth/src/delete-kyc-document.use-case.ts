import { Inject, Injectable, Logger } from '@nestjs/common';
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
import { ObjectStorageService } from '@shared/object-storage';
import { StorageQuotaService } from './storage-quota.service';

export class KycDocumentNotFoundError extends Error {}

@Injectable()
export class DeleteKycDocumentUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(KYC_DOCUMENT_REPOSITORY)
    private readonly kycDocumentRepository: KycDocumentRepository,
    @Inject(ObjectStorageService) private readonly objectStorage: ObjectStorageService,
    @Inject(StorageQuotaService) private readonly storageQuota: StorageQuotaService,
  ) {}

  private readonly logger = new Logger(DeleteKycDocumentUseCase.name);

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

    // The bytes go too. Removing only the record leaves the object in the
    // bucket for ever: the tenant sees the file disappear and keeps paying for
    // it, and the storage total never comes back down.
    try {
      await this.objectStorage.deleteObject(doc.fileKey);
      await this.storageQuota.record(actor.tenantId, 'kyc', -doc.fileSize);
    } catch (error) {
      // The record is already gone, so the caller's delete succeeded. The
      // subtotal is recomputable, and failing here would leave them unable to
      // remove the document at all.
      this.logger.warn(
        `kyc_object_delete_failed:${docId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }

    return { status: true, message: 'success', data: null };
  }
}
