import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { BUNDLE_ALLOCATION_REPOSITORY, type BundleAllocationRepository } from './bundle-allocation.repository';

@Injectable()
export class GetSubscriptionUsageUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_ALLOCATION_REPOSITORY) private readonly bundleAllocationRepository: BundleAllocationRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot access subscription usage');

    const rows = await this.bundleAllocationRepository.sumDataUsedByBundle(actor.tenantId!);

    return {
      status: true,
      message: 'success',
      data: {
        usage: rows.map((r) => ({
          bundleId: r.bundleId,
          bundleCode: r.bundleId,
          usedMb: r.usedMb,
          totalMb: r.totalMb,
        })),
      },
    };
  }
}
