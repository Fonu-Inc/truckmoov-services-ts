import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  WALLET_LEDGER_REPOSITORY,
  type WalletLedgerFilters,
  type WalletLedgerRepository,
} from './wallet-ledger.repository';

@Injectable()
export class ListWalletLedgerUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(WALLET_LEDGER_REPOSITORY) private readonly ledger: WalletLedgerRepository,
  ) {}

  async execute(accessToken: string, filters?: WalletLedgerFilters) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors do not hold a wallet');
    }

    const { items, total } = await this.ledger.list(actor.tenantId!, filters);

    return {
      status: true,
      message: 'success',
      data: {
        items: items.map((entry) => ({
          id: entry.id,
          direction: entry.direction,
          category: entry.category,
          amount: entry.amountKobo / 100,
          // What the balance stood at once this line applied, so the column
          // reads as a statement rather than a list of amounts.
          balanceAfter: entry.balanceAfterKobo / 100,
          unitRate: entry.unitRateKobo / 100,
          quantity: entry.quantity,
          reason: entry.reason,
          reference: entry.reference,
          createdAt: entry.createdAt,
        })),
        total,
      },
    };
  }
}
