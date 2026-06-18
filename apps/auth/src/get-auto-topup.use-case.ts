import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { AUTO_TOP_UP_REPOSITORY, type AutoTopUpRepository } from './auto-topup.repository';

@Injectable()
export class GetAutoTopupUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(AUTO_TOP_UP_REPOSITORY) private readonly autoTopUpRepository: AutoTopUpRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot access auto top-up');

    const s = await this.autoTopUpRepository.findByTenantId(actor.tenantId!);

    if (!s) {
      return {
        status: true,
        message: 'success',
        data: {
          enabled: false,
          thresholdAmount: 0,
          topUpAmount: 0,
          paymentProvider: 'MTN_MOMO',
          mobileNumber: null,
        },
      };
    }

    return {
      status: true,
      message: 'success',
      data: {
        enabled: s.enabled,
        thresholdAmount: s.thresholdKobo / 100,
        topUpAmount: s.topupAmountKobo / 100,
        paymentProvider: s.paymentProvider,
        mobileNumber: s.mobileNumber,
      },
    };
  }
}
