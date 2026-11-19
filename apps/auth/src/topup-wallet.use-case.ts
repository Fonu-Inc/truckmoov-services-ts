import { randomUUID } from 'node:crypto';
import { PAYMENT_GATEWAY, type PaymentGateway } from './contexts/payments';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { SettleWalletTopUpUseCase } from './settle-wallet-top-up.use-case';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  SYSTEM_SETTINGS_REPOSITORY,
  buildDefaultSystemSettings,
  normalizeSystemSettings,
  type SystemSettingsRepository,
} from './system-settings.repository';
import { WALLET_TOP_UP_REPOSITORY, type WalletTopUpRepository } from './wallet-top-up.repository';

type Payload = {
  amount: number;
  mobileMoneyProvider: string;
  mobileNumber: string;
  /** Where the customer lands after paying. Optional: the provider has a default. */
  redirectUrl?: string;
};

export class TopUpAmountOutOfRangeError extends Error {
  constructor(minKobo: number, maxKobo: number) {
    super(`A top-up must be between ${minKobo / 100} and ${maxKobo / 100}`);
  }
}

@Injectable()
export class TopupWalletUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(WALLET_TOP_UP_REPOSITORY) private readonly walletTopUpRepository: WalletTopUpRepository,
    @Inject(SYSTEM_SETTINGS_REPOSITORY) private readonly systemSettingsRepository: SystemSettingsRepository,
    @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGateway,
    @Optional()
    @Inject(SettleWalletTopUpUseCase)
    private readonly settleWalletTopUp?: SettleWalletTopUpUseCase,
  ) {}

  async execute(accessToken: string, payload: Payload) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot top up wallet');

    const amountKobo = Math.round(payload.amount * 100);

    // The bounds are platform configuration rather than a constant, so they can
    // be moved without a deploy. Checked here as well as in the request schema,
    // because the schema cannot read a setting.
    const settings =
      normalizeSystemSettings(
        (await this.systemSettingsRepository.get()) ?? buildDefaultSystemSettings(),
      ).defaults;
    if (
      amountKobo < settings.walletTopUpMinKobo ||
      amountKobo > settings.walletTopUpMaxKobo
    ) {
      throw new TopUpAmountOutOfRangeError(
        settings.walletTopUpMinKobo,
        settings.walletTopUpMaxKobo,
      );
    }

    const id = randomUUID();
    const reference = `TOPUP-${randomUUID().replaceAll('-', '').toUpperCase()}`;
    const now = new Date();

    // Recorded before the charge is initiated, never after. The provider's
    // callback arrives against this reference, and a callback for a row that
    // does not exist yet is settled as an unknown reference and lost.
    await this.walletTopUpRepository.save({
      id,
      tenantId: actor.tenantId!,
      amountKobo,
      provider: payload.mobileMoneyProvider,
      mobileNumber: payload.mobileNumber,
      status: 'pending',
      reference,
      settledAt: null,
      createdAt: now,
    });

    if (this.paymentGateway.demo) {
      if (!this.settleWalletTopUp) {
        throw new Error('Demo wallet top-up settlement is not configured');
      }
      await this.settleWalletTopUp.execute(reference, {
        amountKobo,
        currency: 'NGN',
        channel: 'demo',
      });
      return {
        status: true,
        message: 'success',
        data: {
          transactionId: id,
          paymentReference: reference,
          amount: payload.amount,
          status: 'successful',
          paymentProvider: 'demo',
          mobileNumber: payload.mobileNumber,
          authorizationUrl: null,
          createdAt: now.toISOString(),
        },
      };
    }

    // Until this existed, a top-up recorded a pending row and charged nobody:
    // the wallet could only ever be credited by a callback that never came.
    const charge = await this.paymentGateway.initiateCharge({
      reference,
      amountKobo,
      customerEmail: actor.email,
      redirectUrl: payload.redirectUrl,
      metadata: {
        purpose: 'wallet_topup',
        tenantId: actor.tenantId,
        topUpId: id,
        mobileNumber: payload.mobileNumber,
      },
    });

    return {
      status: true,
      message: 'success',
      data: {
        transactionId: id,
        paymentReference: reference,
        amount: payload.amount,
        status: 'pending',
        paymentProvider: this.paymentGateway.name,
        mobileNumber: payload.mobileNumber,
        authorizationUrl: charge.authorizationUrl,
        createdAt: now.toISOString(),
      },
    };
  }
}
