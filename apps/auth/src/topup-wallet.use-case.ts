import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { WALLET_TOP_UP_REPOSITORY, type WalletTopUpRepository } from './wallet-top-up.repository';

type Payload = { amount: number; mobileMoneyProvider: string; mobileNumber: string };

@Injectable()
export class TopupWalletUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(WALLET_TOP_UP_REPOSITORY) private readonly walletTopUpRepository: WalletTopUpRepository,
  ) {}

  async execute(accessToken: string, payload: Payload) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot top up wallet');

    const amountKobo = Math.round(payload.amount * 100);
    const id = randomUUID();
    const reference = `MOMO-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date();

    await this.walletTopUpRepository.save({
      id,
      tenantId: actor.tenantId!,
      amountKobo,
      provider: payload.mobileMoneyProvider,
      mobileNumber: payload.mobileNumber,
      status: 'pending',
      reference,
      createdAt: now,
    });

    return {
      status: true,
      message: 'success',
      data: {
        transactionId: id,
        paymentReference: reference,
        amount: payload.amount,
        status: 'pending',
        paymentProvider: payload.mobileMoneyProvider,
        mobileNumber: payload.mobileNumber,
        createdAt: now.toISOString(),
      },
    };
  }
}
