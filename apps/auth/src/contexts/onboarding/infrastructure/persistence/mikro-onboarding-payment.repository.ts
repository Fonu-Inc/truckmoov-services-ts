import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type {
  OnboardingPaymentRepository,
  OnboardingPaymentStatus,
  SettleDetails,
  StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import type { OnboardingOrderSummary } from '@auth/onboarding/domain/onboarding-order';
import type { PaymentMethod } from '@auth/onboarding/domain/payment-method';
import { OnboardingPaymentRecord } from './onboarding-orm';

function toStored(r: OnboardingPaymentRecord): StoredOnboardingPayment {
  return {
    id: r.id,
    applicationId: r.applicationId,
    reference: r.reference,
    provider: r.provider,
    amountKobo: Number(r.amountKobo),
    authorizationUrl: r.authorizationUrl ?? null,
    billingEmail: r.billingEmail,
    planCode: r.planCode,
    deviceCount: r.deviceCount,
    orderSummary: (r.orderSummary as OnboardingOrderSummary | null) ?? null,
    quotationId: r.quotationId ?? null,
    invoiceId: r.invoiceId ?? null,
    method: (r.method as PaymentMethod | null) ?? null,
    customerName: r.customerName ?? null,
    note: r.note ?? null,
    autoReconciled: r.autoReconciled ?? true,
    status: r.status as StoredOnboardingPayment['status'],
    paidAt: r.paidAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MikroOnboardingPaymentRepository
  implements OnboardingPaymentRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  private async em() {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork();
  }

  async save(payment: StoredOnboardingPayment): Promise<void> {
    const em = await this.em();
    const existing = await em.findOne(OnboardingPaymentRecord, {
      id: payment.id,
    });
    const target = existing ?? new OnboardingPaymentRecord();
    Object.assign(target, payment);
    if (!existing) em.persist(target);
    await em.flush();
  }

  async findByReference(
    reference: string,
  ): Promise<StoredOnboardingPayment | null> {
    const em = await this.em();
    const record = await em.findOne(OnboardingPaymentRecord, { reference });
    return record ? toStored(record) : null;
  }

  async findLatestForApplication(
    applicationId: string,
  ): Promise<StoredOnboardingPayment | null> {
    const em = await this.em();
    const record = await em.findOne(
      OnboardingPaymentRecord,
      { applicationId },
      { orderBy: { createdAt: 'desc' } },
    );
    return record ? toStored(record) : null;
  }

  async findByQuotationId(
    quotationId: string,
  ): Promise<StoredOnboardingPayment[]> {
    const em = await this.em();
    const records = await em.find(
      OnboardingPaymentRecord,
      { quotationId },
      { orderBy: { createdAt: 'desc' } },
    );
    return records.map(toStored);
  }

  async findByInvoiceId(invoiceId: string): Promise<StoredOnboardingPayment[]> {
    const em = await this.em();
    const records = await em.find(
      OnboardingPaymentRecord,
      { invoiceId },
      { orderBy: { createdAt: 'desc' } },
    );
    return records.map(toStored);
  }

  async findReusablePending(
    applicationId: string,
    amountKobo: number,
    planCode: string,
    createdSince: Date,
  ): Promise<StoredOnboardingPayment | null> {
    const em = await this.em();
    const record = await em.findOne(
      OnboardingPaymentRecord,
      {
        applicationId,
        status: 'pending',
        amountKobo,
        planCode,
        authorizationUrl: { $ne: null },
        createdAt: { $gte: createdSince },
      },
      { orderBy: { createdAt: 'desc' } },
    );
    return record ? toStored(record) : null;
  }

  async setAuthorizationUrl(
    id: string,
    authorizationUrl: string | null,
  ): Promise<void> {
    const em = await this.em();
    await em.nativeUpdate(
      OnboardingPaymentRecord,
      { id },
      { authorizationUrl },
    );
  }

  async settlePending(
    id: string,
    status: Exclude<OnboardingPaymentStatus, 'pending'>,
    paidAt: Date | null,
    details: SettleDetails = { method: null, autoReconciled: true },
  ): Promise<boolean> {
    const from = status === 'paid' ? ['pending', 'failed', 'mismatch'] : ['pending'];
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ id: string }>>(
      `update onboarding_payments
         set status = ?, paid_at = ?, method = ?, auto_reconciled = ?, updated_at = now()
       where id = ? and status in (${from.map(() => '?').join(', ')})
       returning id`,
      [status, paidAt, details.method, details.autoReconciled, id, ...from],
    );
    return rows.length === 1;
  }

  async linkInvoice(id: string, invoiceId: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.getConnection().execute(
      `update onboarding_payments
         set invoice_id = ?, updated_at = now()
       where id = ? and invoice_id is null`,
      [invoiceId, id],
    );
  }

  async deleteUnstarted(id: string): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(OnboardingPaymentRecord, {
      id,
      status: 'pending',
      authorizationUrl: null,
    });
  }

  async deleteForApplication(applicationId: string): Promise<void> {
    const em = await this.em();
    await em.nativeDelete(OnboardingPaymentRecord, { applicationId });
  }
}
