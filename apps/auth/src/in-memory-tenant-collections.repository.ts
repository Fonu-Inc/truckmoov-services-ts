import { Inject, Injectable } from '@nestjs/common';
import { INVOICE_REPOSITORY, type InvoiceRepository } from '@auth/onboarding/domain/invoice.repository';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import type { StoredOnboardingPayment } from '@auth/onboarding/domain/onboarding-payment.repository';
import { InMemoryOnboardingPaymentRepository } from '@auth/onboarding/infrastructure/persistence/in-memory-onboarding-payment.repository';
import { InMemoryWalletTopUpRepository } from './in-memory-wallet-top-up.repository';
import {
  lagosMonthKey,
  type TenantCollectionsRepository,
  type TenantLastPayment,
} from './tenant-collections.repository';

type AttributedPayment = { tenantId: string | null; payment: StoredOnboardingPayment & { paidAt: Date } };

@Injectable()
export class InMemoryTenantCollectionsRepository implements TenantCollectionsRepository {
  constructor(
    @Inject(InMemoryOnboardingPaymentRepository) private readonly payments: InMemoryOnboardingPaymentRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY) private readonly applications: OnboardingApplicationRepository,
    @Inject(InMemoryWalletTopUpRepository) private readonly topUps: InMemoryWalletTopUpRepository,
  ) {}

  async collectedKoboByTenant(from: Date, to: Date): Promise<Map<string, number>> {
    return this.collectedBy(from, to, (tenantId) => tenantId);
  }

  async collectedKoboByLagosMonth(from: Date, to: Date): Promise<Map<string, number>> {
    return this.collectedBy(from, to, (tenantId, at) => (tenantId ? lagosMonthKey(at) : null));
  }

  private async collectedBy(
    from: Date,
    to: Date,
    keyOf: (tenantId: string | null, at: Date) => string | null,
  ): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    const add = (tenantId: string | null, at: Date, kobo: number) => {
      if (!tenantId || tenantId === 'system' || at < from || at >= to) return;
      const key = keyOf(tenantId, at);
      if (key) totals.set(key, (totals.get(key) ?? 0) + kobo);
    };

    for (const { tenantId, payment } of await this.paidPayments()) {
      if (payment.method !== 'wallet') add(tenantId, payment.paidAt, payment.amountKobo);
    }
    for (const topUp of this.topUps.all()) {
      if (topUp.status === 'success' && topUp.settledAt) add(topUp.tenantId, topUp.settledAt, topUp.amountKobo);
    }
    return totals;
  }

  async lastPaymentForTenant(tenantId: string): Promise<TenantLastPayment | null> {
    const latest = (await this.paidPayments())
      .filter((entry) => entry.tenantId === tenantId)
      .sort((a, b) => b.payment.paidAt.getTime() - a.payment.paidAt.getTime())[0];
    if (!latest) return null;
    return { amountKobo: latest.payment.amountKobo, paidAt: latest.payment.paidAt, method: latest.payment.method };
  }

  private async paidPayments(): Promise<AttributedPayment[]> {
    const paid = this.payments
      .all()
      .filter((payment): payment is AttributedPayment['payment'] => payment.status === 'paid' && payment.paidAt !== null);
    return Promise.all(paid.map(async (payment) => ({ tenantId: await this.tenantOf(payment), payment })));
  }

  private async tenantOf(payment: StoredOnboardingPayment): Promise<string | null> {
    if (payment.tenantId) return payment.tenantId;
    const invoice = payment.invoiceId ? await this.invoices.findById(payment.invoiceId) : null;
    if (invoice?.tenantId) return invoice.tenantId;
    return (await this.applications.findById(payment.applicationId))?.tenantId ?? null;
  }
}
