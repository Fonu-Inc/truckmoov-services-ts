import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { BUNDLE_TRANSACTION_REPOSITORY, type BundleTransactionRepository } from './bundle-transaction.repository';

type Filters = {
  search?: string;
  status?: string;
  carriers?: string[];
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class ListBundleTransactionsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_TRANSACTION_REPOSITORY) private readonly bundleTransactionRepository: BundleTransactionRepository,
  ) {}

  async execute(accessToken: string, filters?: Filters) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot access tenant transactions');

    const { items, total } = await this.bundleTransactionRepository.findAll({
      tenantId: actor.tenantId!,
      search: filters?.search,
      status: filters?.status,
      carriers: filters?.carriers,
      startDate: filters?.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters?.endDate ? new Date(filters.endDate) : undefined,
      page: filters?.page,
      limit: filters?.limit,
    });

    return {
      status: true,
      message: 'success',
      data: {
        items: items.map((t) => ({
          id: t.id,
          date: t.createdAt.toISOString(),
          mobileNumber: t.mobileNumber,
          bundle: { id: t.bundleId, code: '', name: '', carrier: '' },
          amount: t.amountKobo / 100,
          status: t.status,
          paymentReference: t.paymentReference ?? null,
          failureReason: t.failureReason ?? null,
        })),
        total,
      },
    };
  }
}
