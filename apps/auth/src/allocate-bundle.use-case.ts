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
import { BUNDLE_CARRIER_REPOSITORY, type BundleCarrierRepository } from './bundle-carrier.repository';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { InsufficientWalletBalanceError } from './charge-usage.use-case';
import { WALLET_LEDGER_REPOSITORY, type StoredWalletLedgerEntry, type WalletLedgerRepository } from './wallet-ledger.repository';

type Payload = { carrierId: string; planType: string; bundleId: string; mobileNumbers: string[]; idempotencyKey?: string };
type Allocation = Awaited<ReturnType<BundleAllocationRepository['findByPaymentReference']>>[number];
type Bundle = NonNullable<Awaited<ReturnType<BundleCatalogRepository['findById']>>>;

export class AllocationReferenceError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

/** A retried purchase whose first attempt failed and was refunded; the key cannot be reused. */
export class PurchaseRefundedError extends Error {
  constructor() {
    super('Purchase failed and was refunded, use a new idempotency key');
  }
}

const BLOCKED_SIM_STATUSES = new Set(['suspended', 'deactivated']);
const REFUND_REASON = 'Allocation failed; the amount was refunded to the wallet';

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
    @Inject(BUNDLE_CARRIER_REPOSITORY) private readonly bundleCarrierRepository: BundleCarrierRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepository: SimRepository,
    @Inject(WALLET_LEDGER_REPOSITORY) private readonly ledger: WalletLedgerRepository,
  ) {}

  async execute(accessToken: string, payload: Payload) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot allocate bundles');

    const tenantId = actor.tenantId!;
    const key = payload.idempotencyKey ?? randomUUID();

    const bundle = await this.resolveBundle(payload.carrierId, payload.bundleId);
    // One SIM is charged once, however many times the request names it.
    const mobileNumbers = [...new Set(payload.mobileNumbers.map((n) => n.trim()))];

    const existing = await this.bundleAllocationRepository.findByPaymentReference(tenantId, key);
    if (existing.length > 0) {
      const original = await this.ledger.findByIdempotencyKey(tenantId, `bundle:${tenantId}:${key}`);
      return this.settlePrior(tenantId, key, original, existing);
    }
    const count = mobileNumbers.length;

    await this.assertTenantSims(tenantId, mobileNumbers);

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
    if (!debited.ok) throw new InsufficientWalletBalanceError(totalCostKobo);
    if (debited.replayed) {
      const prior = await this.bundleAllocationRepository.findByPaymentReference(tenantId, key);
      return this.settlePrior(tenantId, key, debited.entry, prior);
    }

    try {
      const allocationIds = await this.persistPurchase(tenantId, key, bundle, mobileNumbers);
      await this.spendingLimitService.recordSpend(tenantId, totalCostKobo);
      return this.toResponse(totalCostKobo, allocationIds);
    } catch (err) {
      await this.tryRefund(tenantId, key, debited.entry, err);
      throw err;
    }
  }

  private async resolveBundle(carrierId: string, bundleId: string): Promise<Bundle> {
    const carrier = await this.bundleCarrierRepository.findById(carrierId);
    if (!carrier) throw new AllocationReferenceError('carrierId', 'Carrier not found');
    const bundle = await this.bundleCatalogRepository.findById(bundleId);
    if (!bundle) throw new AllocationReferenceError('bundleId', 'Bundle not found');
    if (!carrier.active || !bundle.active) throw new AllocationReferenceError('bundleId', 'Bundle is not available');
    if (bundle.carrierId !== carrier.id) throw new AllocationReferenceError('bundleId', 'Bundle does not belong to this carrier');
    return bundle;
  }

  private async assertTenantSims(tenantId: string, mobileNumbers: string[]) {
    const sims = await this.simRepository.findByMsisdns(tenantId, mobileNumbers);
    const known = new Set(sims.map((s) => s.msisdn));
    const unknown = mobileNumbers.filter((n) => !known.has(n));
    if (unknown.length > 0) throw new AllocationReferenceError('mobileNumbers', `No SIM found for: ${unknown.join(', ')}`);
    const blocked = sims.filter((s) => BLOCKED_SIM_STATUSES.has(s.status)).map((s) => `${s.msisdn} (${s.status})`);
    if (blocked.length > 0) {
      throw new AllocationReferenceError('mobileNumbers', `Cannot top up a suspended or deactivated SIM: ${blocked.join(', ')}`);
    }
  }

  // A replay is judged and refunded against the original debit, never the replaying request.
  private async settlePrior(tenantId: string, key: string, debit: StoredWalletLedgerEntry | null, prior: Allocation[]) {
    const complete = !!debit && prior.length >= debit.quantity && prior.every((a) => a.status !== 'cancelled');
    if (complete) return this.toResponse(debit.amountKobo, prior.map((a) => a.id));
    await this.refundPurchase(tenantId, key, debit);
    throw new PurchaseRefundedError();
  }

  private async tryRefund(tenantId: string, key: string, debit: StoredWalletLedgerEntry | null, cause: unknown) {
    try {
      await this.refundPurchase(tenantId, key, debit);
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

  private async refundPurchase(tenantId: string, key: string, debit: StoredWalletLedgerEntry | null) {
    await this.cancelAllocations(tenantId, key);
    await this.bundleTransactionRepository.failByPaymentReference(tenantId, key, REFUND_REASON);
    if (!debit) return;
    await this.tenantWalletRepository.credit(tenantId, debit.amountKobo, {
      category: 'refund',
      quantity: debit.quantity,
      unitRateKobo: debit.unitRateKobo,
      reason: `Refund: ${debit.reason} could not be allocated`,
      reference: debit.reference,
      idempotencyKey: `bundle-refund:${tenantId}:${key}`,
    });
  }

  private async cancelAllocations(tenantId: string, key: string) {
    const saved = await this.bundleAllocationRepository.findByPaymentReference(tenantId, key);
    for (const allocation of saved.filter((a) => a.status !== 'cancelled')) {
      await this.bundleAllocationRepository.save({ ...allocation, status: 'cancelled', updatedAt: new Date() });
    }
  }

  private toResponse(totalKobo: number, allocationIds: string[]) {
    return {
      status: true,
      message: 'success',
      data: {
        allocationIds,
        totalAmount: totalKobo / 100,
        successfulCount: allocationIds.length,
        failedCount: 0,
      },
    };
  }
}
