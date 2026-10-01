import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import {
  BILLING_AUDIT,
  type BillingActor,
  type BillingAudit,
} from '@auth/onboarding/domain/ports/billing-audit.port';
import type { NoticeKind } from '@auth/onboarding/domain/enforcement-stage';
import type { AssetCounts } from './tenant-suspension.repository';

export const ENFORCEMENT_AUDIT_ACTOR: BillingActor = {
  userId: 'system',
  name: 'Automatic billing enforcement',
  role: 'system',
  email: null,
  tenantId: SYSTEM_TENANT_ID,
};

export type RestoreTrigger = 'invoice_paid' | 'wallet_topup' | 'subscription' | 'sweep';

export type AutoSuspendedAudit = {
  tenantId: string;
  tenantName: string;
  reason: string;
  unpaidSince: string;
  graceDays: number;
  owedNgn: number;
  counts: AssetCounts;
  cascadeStatus: string;
};

export type RunAudit = {
  runDate: string;
  notified: number;
  suspended: number;
  restored: number;
  capped: number;
};

@Injectable()
export class EnforcementAudit {
  private readonly logger = new Logger(EnforcementAudit.name);

  constructor(@Inject(BILLING_AUDIT) private readonly audit: BillingAudit) {}

  autoSuspended(input: AutoSuspendedAudit): Promise<void> {
    return this.record('system.tenant.auto_suspended', 'tenant', input.tenantId, {
      summary: `${input.tenantName} suspended automatically. ${input.reason}`,
      cause: 'non_payment',
      reason: input.reason,
      unpaidSince: input.unpaidSince,
      graceDays: input.graceDays,
      owedNgn: input.owedNgn,
      counts: input.counts,
      cascadeStatus: input.cascadeStatus,
    });
  }

  autoRestored(input: {
    tenantId: string;
    trigger: RestoreTrigger;
    counts: AssetCounts;
    reason: string | null;
  }): Promise<void> {
    const why = input.reason ? ` Earlier reason: ${input.reason}` : '';
    return this.record('system.tenant.auto_restored', 'tenant', input.tenantId, {
      summary: `Customer ${input.tenantId} restored automatically after payment.${why}`,
      trigger: input.trigger,
      counts: input.counts,
    });
  }

  suspensionIncomplete(input: { tenantId: string; attempts: number; error: string | null }): Promise<void> {
    return this.record('system.tenant.suspension_incomplete', 'tenant', input.tenantId, {
      summary: `Suspension of customer ${input.tenantId} could not be finished after ${input.attempts} tries`,
      attempts: input.attempts,
      error: input.error,
    });
  }

  noticeSent(input: {
    tenantId: string;
    kind: NoticeKind;
    recipients: number;
    dedupKey: string;
  }): Promise<void> {
    return this.record('system.billing.enforcement_notice_sent', 'tenant', input.tenantId, {
      summary: `Email notice "${input.kind}" sent to customer ${input.tenantId}`,
      kind: input.kind,
      recipients: input.recipients,
      dedupKey: input.dedupKey,
    });
  }

  run(input: RunAudit): Promise<void> {
    return this.record('system.billing.enforcement_run', 'billing_enforcement_run', input.runDate, {
      summary: `Daily check ${input.runDate}: ${input.notified} notices sent, ${input.suspended} customers suspended, ${input.capped} held back by the limit`,
      notified: input.notified,
      suspended: input.suspended,
      restored: input.restored,
      capped: input.capped,
    });
  }

  private async record(
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown> & { summary: string },
  ): Promise<void> {
    const { summary, ...rest } = metadata;
    try {
      await this.audit.record(ENFORCEMENT_AUDIT_ACTOR, { action, entityType, entityId, summary, metadata: rest });
    } catch (error) {
      this.logger.warn(
        `enforcement_audit_failed:${action}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
