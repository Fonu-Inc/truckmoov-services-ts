import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { AUTO_TOP_UP_REPOSITORY, type AutoTopUpRepository } from './auto-topup.repository';

type Payload = {
  thresholdAmount: number;
  topUpAmount: number;
  paymentProvider: string;
  mobileNumber: string;
};

@Injectable()
export class SaveAutoTopupUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(AUTO_TOP_UP_REPOSITORY) private readonly autoTopUpRepository: AutoTopUpRepository,
  ) {}

  async execute(accessToken: string, payload: Payload) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot configure auto top-up');

    const tenantId = actor.tenantId!;
    const existing = await this.autoTopUpRepository.findByTenantId(tenantId);

    await this.autoTopUpRepository.save({
      tenantId,
      enabled: true,
      thresholdKobo: Math.round(payload.thresholdAmount * 100),
      topupAmountKobo: Math.round(payload.topUpAmount * 100),
      paymentProvider: payload.paymentProvider,
      mobileNumber: payload.mobileNumber,
      updatedAt: new Date(),
    });

    return { status: true, message: 'success', data: { enabled: true } };
  }
}
