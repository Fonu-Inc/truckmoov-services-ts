import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import { ChargeUsageUseCase, InsufficientWalletBalanceError } from './charge-usage.use-case';
import { ARREARS_REPOSITORY, type ArrearsRepository, type StoredArrear } from './arrears.repository';
import { TENANT_TERMINATION_REPOSITORY, type TenantTerminationRepository } from './tenant-termination.repository';
import { EnforcementAudit, type RestoreTrigger } from './enforcement-audit';
import { EnforcementNoticeService } from './enforcement-notice.service';
import { SYSTEM_ENFORCEMENT_ACTOR, TenantSuspensionService } from './tenant-suspension.service';
import {
  TENANT_SUSPENSION_REPOSITORY,
  type AssetCounts,
  type StoredTenantSuspension,
  type TenantSuspensionRepository,
} from './tenant-suspension.repository';

const LAGOS_MIDNIGHT_OFFSET = '+01:00';

@Injectable()
export class EnforcementRestoreService {
  private readonly logger = new Logger(EnforcementRestoreService.name);

  constructor(
    @Inject(ARREARS_REPOSITORY) private readonly arrears: ArrearsRepository,
    @Inject(ChargeUsageUseCase) private readonly chargeUsage: ChargeUsageUseCase,
    @Inject(TenantSuspensionService) private readonly suspension: TenantSuspensionService,
    @Inject(TENANT_SUSPENSION_REPOSITORY) private readonly suspensions: TenantSuspensionRepository,
    @Inject(EnforcementNoticeService) private readonly notices: EnforcementNoticeService,
    @Inject(EnforcementAudit) private readonly audit: EnforcementAudit,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY) private readonly payments: OnboardingPaymentRepository,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(TENANT_TERMINATION_REPOSITORY) private readonly terminations: TenantTerminationRepository,
  ) {}

  /** Never throws: a payment callback must not fail because of enforcement. */
  async onPaymentSettled(tenantId: string, trigger: RestoreTrigger): Promise<void> {
    try {
      await this.settleArrears(tenantId);
      await this.restoreIfClear(tenantId, trigger);
    } catch (error) {
      this.logger.error(
        `enforcement_restore_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  async onApplicationPaymentSettled(reference: string): Promise<void> {
    try {
      const payment = await this.payments.findByReference(reference);
      const application = payment ? await this.applications.findById(payment.applicationId) : null;
      if (application?.tenantId) await this.onPaymentSettled(application.tenantId, 'invoice_paid');
    } catch (error) {
      this.logger.error(
        `enforcement_restore_lookup_failed:${reference}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  async settleArrears(tenantId: string): Promise<number> {
    let settled = 0;
    for (const arrear of await this.arrears.listOpen(tenantId)) {
      const outcome = await this.retryCharge(arrear);
      if (outcome === 'stop') break;
      if (outcome === 'paid') settled += 1;
    }
    return settled;
  }

  async restoreIfClear(tenantId: string, trigger: RestoreTrigger): Promise<boolean> {
    const stored = await this.suspensions.findOne(tenantId);
    if (!stored || stored.cause !== 'non_payment') return false;
    if (await this.terminations.findByTenantId(tenantId)) return false;
    if ((await this.arrears.openItems(tenantId)).length > 0) return false;

    const result = await this.suspension.restore(tenantId, {
      cause: 'non_payment',
      actor: SYSTEM_ENFORCEMENT_ACTOR,
    });
    if (!result.restored) return false;
    await this.announce(stored, result.counts, trigger);
    return true;
  }

  /** Audit and email once a restore has fully finished, however it finished. */
  async announce(stored: StoredTenantSuspension, counts: AssetCounts, trigger: RestoreTrigger): Promise<void> {
    await this.audit.autoRestored({ tenantId: stored.tenantId, trigger, counts, reason: stored.reason });
    await this.notices.sendRestored({
      tenantId: stored.tenantId,
      suspendedAt: stored.suspendedAt,
      unpaidSince: stored.unpaidSince,
    });
  }

  private async retryCharge(arrear: StoredArrear): Promise<'paid' | 'stop' | 'open'> {
    const month = arrear.reference.split(':').pop() ?? '';
    try {
      const result = await this.chargeUsage.execute({
        tenantId: arrear.tenantId,
        channel: 'iot_sim',
        quantity: Math.max(arrear.quantity, 1),
        reason: `IoT SIM connectivity for ${Math.max(arrear.quantity, 1)} active SIM(s), ${month}`,
        reference: arrear.reference,
        occurredAt: new Date(`${arrear.dueDate}T00:00:00${LAGOS_MIDNIGHT_OFFSET}`),
      });
      await this.arrears.resolve(arrear.id, result.charged || result.replayed ? 'paid' : 'no_charge');
      return 'paid';
    } catch (error) {
      if (error instanceof InsufficientWalletBalanceError) return 'stop';
      this.logger.warn(
        `arrear_retry_failed:${arrear.reference}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return 'open';
    }
  }
}
