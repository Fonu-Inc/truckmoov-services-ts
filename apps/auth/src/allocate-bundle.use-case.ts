import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository } from './bundle-catalog.repository';
import { TENANT_WALLET_REPOSITORY, type TenantWalletRepository } from './tenant-wallet.repository';
import { SpendingLimitService } from './spending-limit.service';
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
    @Inject(SpendingLimitService) private readonly spendingLimitService: SpendingLimitService,
  ) {}

  async execute(accessToken: string, payload: Payload) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot allocate bundles');

    const tenantId = actor.tenantId!;

    const bundle = await this.bundleCatalogRepository.findById(payload.bundleId);
    if (!bundle) throw new Error('Bundle not found');

    const totalCostKobo = bundle.priceKobo * payload.mobileNumbers.length;

    // Checked before the debit, so a refused spend leaves the balance alone.
    await this.spendingLimitService.assertWithinLimit(tenantId, totalCostKobo);

    // Atomic debit up front prevents concurrent double-spend: the balance is
    // reserved before any allocation, and unused funds are refunded per failure.
    const debited = await this.tenantWalletRepository.debit(tenantId, totalCostKobo, {
      category: 'data_bundle',
      quantity: payload.mobileNumbers.length,
      // The bundle price at this moment, so a later catalogue change cannot
      // re-price what the tenant already paid.
      unitRateKobo: bundle.priceKobo,
      reason: `${bundle.name} for ${payload.mobileNumbers.length} SIM(s)`,
      reference: bundle.id,
    });
    if (!debited.ok) throw new Error('Insufficient wallet balance');

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
        // Refund the reserved cost for this failed allocation.
        await this.tenantWalletRepository.credit(tenantId, bundle.priceKobo, {
          category: 'refund',
          quantity: 1,
          unitRateKobo: bundle.priceKobo,
          reason: `Refund: ${bundle.name} could not be allocated to ${mobileNumber}`,
          reference: bundle.id,
        });
        failures.push({ mobileNumber, reason: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    const successfulCount = allocationIds.length;

    // Failed allocations were refunded, so only the amount that stayed spent
    // counts towards the limit.
    await this.spendingLimitService.recordSpend(tenantId, bundle.priceKobo * successfulCount);

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
