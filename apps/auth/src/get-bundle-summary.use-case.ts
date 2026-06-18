import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { TENANT_WALLET_REPOSITORY, type TenantWalletRepository } from './tenant-wallet.repository';
import { WALLET_TOP_UP_REPOSITORY, type WalletTopUpRepository } from './wallet-top-up.repository';
import { BUNDLE_ALLOCATION_REPOSITORY, type BundleAllocationRepository } from './bundle-allocation.repository';
import { BUNDLE_TRANSACTION_REPOSITORY, type BundleTransactionRepository } from './bundle-transaction.repository';

@Injectable()
export class GetBundleSummaryUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TENANT_WALLET_REPOSITORY) private readonly tenantWalletRepository: TenantWalletRepository,
    @Inject(WALLET_TOP_UP_REPOSITORY) private readonly walletTopUpRepository: WalletTopUpRepository,
    @Inject(BUNDLE_ALLOCATION_REPOSITORY) private readonly bundleAllocationRepository: BundleAllocationRepository,
    @Inject(BUNDLE_TRANSACTION_REPOSITORY) private readonly bundleTransactionRepository: BundleTransactionRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot access bundle summary');

    const tenantId = actor.tenantId!;
    const now = new Date();

    const [
      wallet,
      totalAmountToppedUpKobo,
      successfulTopUpTransactions,
      allocationCounts,
      expiringWithinSevenDays,
      monthlySpendKobo,
      topUpsThisMonth,
    ] = await Promise.all([
      this.tenantWalletRepository.findByTenantId(tenantId),
      this.walletTopUpRepository.sumSuccessfulByTenantId(tenantId),
      this.walletTopUpRepository.countSuccessfulByTenantId(tenantId),
      this.bundleAllocationRepository.countByStatus(tenantId),
      this.bundleAllocationRepository.findExpiringWithin(tenantId, 7),
      this.bundleTransactionRepository.sumTotalByTenantAndMonth(tenantId, now.getFullYear(), now.getMonth() + 1),
      this.bundleTransactionRepository.countByTenantAndMonth(tenantId, now.getFullYear(), now.getMonth() + 1),
    ]);

    return {
      status: true,
      message: 'success',
      data: {
        walletBalance: (wallet?.balanceKobo ?? 0) / 100,
        currency: 'NGN',
        totalAmountToppedUp: totalAmountToppedUpKobo / 100,
        successfulTopUpTransactions,
        activeAllocations: allocationCounts['active'] ?? 0,
        expiredAllocations: allocationCounts['expired'] ?? 0,
        expiringWithinSevenDays: expiringWithinSevenDays.length,
        monthlySpend: monthlySpendKobo / 100,
        topUpsThisMonth,
        totalDataUsedGb: 0,
      },
    };
  }
}
