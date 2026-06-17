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
} from './tenant-business-info.repository';

@Injectable()
export class GetBusinessInfoUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TENANT_BUSINESS_INFO_REPOSITORY)
    private readonly businessInfoRepository: TenantBusinessInfoRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors do not have business info');
    }

    const info = await this.businessInfoRepository.findByTenantId(actor.tenantId);

    return {
      status: true,
      message: 'success',
      data: info ?? null,
    };
  }
}
