import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository } from './bundle-catalog.repository';
import { TENANT_WALLET_REPOSITORY, type TenantWalletRepository } from './tenant-wallet.repository';
import { SpendingLimitService } from './spending-limit.service';
import { BUNDLE_ALLOCATION_REPOSITORY, type BundleAllocationRepository } from './bundle-allocation.repository';
import { BUNDLE_TRANSACTION_REPOSITORY, type BundleTransactionRepository } from './bundle-transaction.repository';

type Payload = { carrierId: string; planType: string; bundleId: string; mobileNumbers: string[]; idempotencyKey?: string };
type Allocation = Awaited<ReturnType<BundleAllocationRepository['findByPaymentReference']>>[number];
type Bundle = NonNullable<Awaited<ReturnType<BundleCatalogRepository['findById']>>>;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

@Injectable()
export class AllocateBundleUseCase {
  private readonly logger = new Logger(AllocateBundleUseCase.name);

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
    const key = payload.idempotencyKey ?? randomUUID();

    const bundle = await this.bundleCatalogRepository.findById(payload.bundleId);
    if (!bundle) throw new Error('Bundle not found');

    const existing = await this.bundleAllocationRepository.findByPaymentReference(tenantId, key);
    const count = payload.mobileNumbers.length;
    if (existing.length > 0) return this.settlePrior(tenantId, key, bundle, count, existing);

    const totalCostKobo = bundle.priceKobo * count;

    await this.spendingLimitService.assertWithinLimit(tenantId, totalCostKobo);

    const debited = await this.tenantWalletRepository.debit(tenantId, totalCostKobo, {
      category: 'data_bundle',
      quantity: count,
      unitRateKobo: bundle.priceKobo,
      reason: `${bundle.name} for ${count} SIM(s)`,
      reference: bundle.id,
      idempotencyKey: `bundle:${tenantId}:${key}`,
    });
    if (!debited.ok) throw new Error('Insufficient wallet balance');
    if (debited.replayed) {
      const prior = await this.bundleAllocationRepository.findByPaymentReference(tenantId, key);
      return this.settlePrior(tenantId, key, bundle, count, prior);
    }

    try {
      const allocationIds = await this.persistPurchase(tenantId, key, bundle, payload.mobileNumbers);
      await this.spendingLimitService.recordSpend(tenantId, totalCostKobo);
      return this.toResponse(bundle, allocationIds);
    } catch (err) {
      await this.tryRefund(tenantId, key, bundle, count, err);
      throw err;
    }
  }

  private async settlePrior(tenantId: string, key: string, bundle: Bundle, count: number, prior: Allocation[]) {
    const complete = prior.length >= count && prior.every((a) => a.status !== 'cancelled');
    if (complete) return this.toResponse(bundle, prior.map((a) => a.id));
    await this.refundPurchase(tenantId, key, bundle, bundle.priceKobo * count, count);
    throw new Error('Purchase failed and was refunded, use a new idempotency key');
  }

  private async tryRefund(tenantId: string, key: string, bundle: Bundle, count: number, cause: unknown) {
    try {
      await this.refundPurchase(tenantId, key, bundle, bundle.priceKobo * count, count);
    } catch (refundErr) {
      this.logger.error(`Refund failed for ${tenantId}:${key} after: ${String(cause)}`, refundErr as Error);
    }
  }

  private async persistPurchase(tenantId: string, key: string, bundle: Bundle, mobileNumbers: string[]) {
    const now = new Date();
    const allocationIds: string[] = [];
    for (const mobileNumber of mobileNumbers) {
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
        paymentReference: key,
        createdAt: now,
        updatedAt: now,
      });
      allocationIds.push(id);
      await this.bundleTransactionRepository.save({
        id: randomUUID(),
        tenantId,
        mobileNumber,
        bundleId: bundle.id,
        amountKobo: bundle.priceKobo,
        status: 'success',
        paymentReference: key,
        failureReason: null,
        createdAt: now,
      });
    }
    return allocationIds;
  }

  private async refundPurchase(tenantId: string, key: string, bundle: Bundle, amountKobo: number, count: number) {
    await this.cancelAllocations(tenantId, key);
    await this.tenantWalletRepository.credit(tenantId, amountKobo, {
      category: 'refund',
      quantity: count,
      unitRateKobo: bundle.priceKobo,
      reason: `Refund: ${bundle.name} for ${count} SIM(s) could not be allocated`,
      reference: bundle.id,
      idempotencyKey: `bundle-refund:${tenantId}:${key}`,
    });
  }

  private async cancelAllocations(tenantId: string, key: string) {
    const saved = await this.bundleAllocationRepository.findByPaymentReference(tenantId, key);
    for (const allocation of saved.filter((a) => a.status !== 'cancelled')) {
      await this.bundleAllocationRepository.save({ ...allocation, status: 'cancelled', updatedAt: new Date() });
    }
  }

  private toResponse(bundle: Bundle, allocationIds: string[]) {
    return {
      status: true,
      message: 'success',
      data: {
        allocationIds,
        totalAmount: (bundle.priceKobo * allocationIds.length) / 100,
        successfulCount: allocationIds.length,
        failedCount: 0,
      },
    };
  }
}
