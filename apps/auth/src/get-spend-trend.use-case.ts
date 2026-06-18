import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { BUNDLE_TRANSACTION_REPOSITORY, type BundleTransactionRepository } from './bundle-transaction.repository';

type Range = '7d' | '30d' | '90d' | 'custom';

function computeDateRange(range: Range, startDate?: string, endDate?: string): { start: Date; end: Date } {
  const end = new Date();
  if (range === 'custom') {
    return { start: new Date(startDate!), end: endDate ? new Date(endDate) : end };
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  return { start, end };
}

@Injectable()
export class GetSpendTrendUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_TRANSACTION_REPOSITORY) private readonly bundleTransactionRepository: BundleTransactionRepository,
  ) {}

  async execute(accessToken: string, range: Range, startDate?: string, endDate?: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot access spend trends');

    const { start, end } = computeDateRange(range, startDate, endDate);
    const rows = await this.bundleTransactionRepository.sumByDate(actor.tenantId!, start, end);

    return {
      status: true,
      message: 'success',
      data: {
        trend: rows.map((r) => ({ date: r.date, amount: r.amountKobo / 100 })),
      },
    };
  }
}
