import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository } from './bundle-catalog.repository';
import { TENANT_WALLET_REPOSITORY, type TenantWalletRepository } from './tenant-wallet.repository';
import { BUNDLE_ALLOCATION_REPOSITORY, type BundleAllocationRepository } from './bundle-allocation.repository';
import { BUNDLE_TRANSACTION_REPOSITORY, type BundleTransactionRepository } from './bundle-transaction.repository';

type Payload = { carrierId: string; planType: string; bundleId: string; mobileNumbers: string[] };

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

@Injectable()
export class AllocateBundleUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly bundleCatalogRepository: BundleCatalogRepository,
    @Inject(TENANT_WALLET_REPOSITORY) private readonly tenantWalletRepository: TenantWalletRepository,
    @Inject(BUNDLE_ALLOCATION_REPOSITORY) private readonly bundleAllocationRepository: BundleAllocationRepository,
    @Inject(BUNDLE_TRANSACTION_REPOSITORY) private readonly bundleTransactionRepository: BundleTransactionRepository,
  ) {}

  async execute(accessToken: string, payload: Payload) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot allocate bundles');

    const tenantId = actor.tenantId!;

    const bundle = await this.bundleCatalogRepository.findById(payload.bundleId);
    if (!bundle) throw new Error('Bundle not found');

    const wallet = await this.tenantWalletRepository.findByTenantId(tenantId);
    const balanceKobo = wallet?.balanceKobo ?? 0;
    const totalCostKobo = bundle.priceKobo * payload.mobileNumbers.length;

    if (balanceKobo < totalCostKobo) throw new Error('Insufficient wallet balance');

    const now = new Date();
    const allocationIds: string[] = [];
    const failures: Array<{ mobileNumber: string; reason: string }> = [];

    for (const mobileNumber of payload.mobileNumbers) {
      try {
        const id = randomUUID();
        await this.bundleAllocationRepository.save({
          id,
          tenantId,
          mobileNumber,
          bundleId: bundle.id,
          dataUsedMb: 0,
          dataTotalMb: bundle.dataAmountGb * 1024,
          activatedAt: now,
          expiresAt: addDays(now, bundle.validityDays),
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });

        await this.bundleTransactionRepository.save({
          id: randomUUID(),
          tenantId,
          mobileNumber,
          bundleId: bundle.id,
          amountKobo: bundle.priceKobo,
          status: 'success',
          paymentReference: null,
          failureReason: null,
          createdAt: now,
        });

        allocationIds.push(id);
      } catch (err) {
        failures.push({ mobileNumber, reason: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    const successfulCount = allocationIds.length;
    const newBalanceKobo = balanceKobo - bundle.priceKobo * successfulCount;
    await this.tenantWalletRepository.save({
      tenantId,
      balanceKobo: newBalanceKobo,
      currency: wallet?.currency ?? 'NGN',
      updatedAt: now,
    });

    return {
      status: true,
      message: 'success',
      data: {
        allocationIds,
        totalAmount: (bundle.priceKobo * successfulCount) / 100,
        successfulCount,
        failedCount: failures.length,
        ...(failures.length > 0 && { failures }),
      },
    };
  }
}
