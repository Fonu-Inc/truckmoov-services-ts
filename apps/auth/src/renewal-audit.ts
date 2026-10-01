import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  BILLING_AUDIT,
  type BillingAudit,
} from '@auth/onboarding/domain/ports/billing-audit.port';
import { ENFORCEMENT_AUDIT_ACTOR } from './enforcement-audit';

type Metadata = Record<string, unknown> & { summary: string };

@Injectable()
export class RenewalAudit {
  private readonly logger = new Logger(RenewalAudit.name);

  constructor(@Inject(BILLING_AUDIT) private readonly audit: BillingAudit) {}

  issued(input: {
    invoiceId: string;
    number: string;
    tenantId: string;
    periodId: string;
    periodEnd: string;
    deviceCount: number;
    totalNgn: number;
  }): Promise<void> {
    const { invoiceId, number, ...rest } = input;
    return this.record('system.billing.renewal_invoice_issued', 'invoice', invoiceId, {
      summary: `Renewal invoice ${number} issued to customer ${input.tenantId}`,
      number,
      ...rest,
    });
  }

  repriced(input: { invoiceId: string; number: string; fromNgn: number; toNgn: number; deviceCount: number }): Promise<void> {
    const { invoiceId, number, ...rest } = input;
    return this.record('system.billing.renewal_invoice_repriced', 'invoice', invoiceId, {
      summary: `Renewal invoice ${number} repriced from ${input.fromNgn} to ${input.toNgn}`,
      number,
      ...rest,
    });
  }

  cancelled(input: { invoiceId: string; number: string; reason: string }): Promise<void> {
    return this.record('system.billing.renewal_invoice_cancelled', 'invoice', input.invoiceId, {
      summary: `Renewal invoice ${input.number} cancelled: ${input.reason}`,
      number: input.number,
      reason: input.reason,
    });
  }

  cancelBlocked(input: { invoiceId: string; number: string; reason: string }): Promise<void> {
    return this.record('system.billing.renewal_cancel_blocked', 'invoice', input.invoiceId, {
      summary: `Renewal invoice ${input.number} not cancelled, a payment exists (${input.reason})`,
      number: input.number,
      reason: input.reason,
    });
  }

  paid(input: {
    invoiceId: string;
    number: string;
    tenantId: string;
    paymentReference: string;
    method: string | null;
    newPeriodEnd: string | null;
  }): Promise<void> {
    const { invoiceId, number, ...rest } = input;
    return this.record('system.billing.renewal_paid', 'invoice', invoiceId, {
      summary: `Renewal invoice ${number} paid`,
      number,
      ...rest,
    });
  }

  licenceRenewed(input: { tenantId: string; invoiceNumber: string; newPeriodEnd: string }): Promise<void> {
    return this.record('system.tenant.licence_renewed', 'tenant', input.tenantId, {
      summary: `Licence renewed until ${input.newPeriodEnd} (invoice ${input.invoiceNumber})`,
      invoiceNumber: input.invoiceNumber,
      newPeriodEnd: input.newPeriodEnd,
    });
  }

  duplicatePayment(input: {
    invoiceId: string;
    number: string;
    tenantId: string;
    paymentReference: string;
    amountNgn: number;
    reason: string;
  }): Promise<void> {
    const { invoiceId, number, ...rest } = input;
    return this.record('system.billing.renewal_duplicate_payment', 'invoice', invoiceId, {
      summary: `Extra payment ${input.paymentReference} for invoice ${number} credited to the wallet`,
      number,
      ...rest,
    });
  }

  private async record(action: string, entityType: string, entityId: string, metadata: Metadata): Promise<void> {
    const { summary, ...rest } = metadata;
    try {
      await this.audit.record(ENFORCEMENT_AUDIT_ACTOR, { action, entityType, entityId, summary, metadata: rest });
    } catch (error) {
      this.logger.warn(`renewal_audit_failed:${action}:${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
}
