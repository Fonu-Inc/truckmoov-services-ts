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
  TENANT_BUSINESS_INFO_REPOSITORY,
  type TenantBusinessInfoRepository,
  type StoredTenantBusinessInfo,
} from './tenant-business-info.repository';

export type SaveBusinessInfoPayload = Omit<
  StoredTenantBusinessInfo,
  'tenantId' | 'verificationStatus' | 'updatedAt'
>;

@Injectable()
export class SaveBusinessInfoUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TENANT_BUSINESS_INFO_REPOSITORY)
    private readonly businessInfoRepository: TenantBusinessInfoRepository,
  ) {}

  async execute(accessToken: string, payload: SaveBusinessInfoPayload) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors cannot save business info');
    }

    const existing = await this.businessInfoRepository.findByTenantId(
      actor.tenantId,
    );

    await this.businessInfoRepository.save({
      ...payload,
      tenantId: actor.tenantId,
      verificationStatus: existing?.verificationStatus ?? 'pending',
      updatedAt: new Date(),
    });

    return { status: true, message: 'success', data: null };
  }
}
