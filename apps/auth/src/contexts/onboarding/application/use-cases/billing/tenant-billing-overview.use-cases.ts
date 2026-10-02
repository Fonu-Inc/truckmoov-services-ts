import { Inject, Injectable } from '@nestjs/common';
import { clampPage } from '@auth/onboarding/domain/billing-pricing';
import { lagosDate } from '@auth/onboarding/domain/invoice-dates';
import { INVOICE_REPOSITORY, type InvoiceRepository } from '@auth/onboarding/domain/invoice.repository';
import {
  LICENCE_PERIOD_REPOSITORY,
  type LicencePeriodRepository,
} from '@auth/onboarding/domain/licence-period.repository';
import {
  PAYMENT_HISTORY_REPOSITORY,
  type PaymentHistoryRepository,
} from '@auth/onboarding/domain/payment-history.repository';
import { QUOTATION_REPOSITORY, type QuotationRepository } from '@auth/onboarding/domain/quotation.repository';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';
import {
  TENANT_FIELD_ACTIVITY_READER,
  type TenantFieldActivityReader,
} from '@auth/onboarding/domain/tenant-field-activity.reader';
import {
  DEVICE_SETUP_REQUEST_REPOSITORY,
  type DeviceSetupRequestRepository,
} from '../../../../../device-setup-request.repository';
import {
  TENANT_WALLET_REPOSITORY,
  type TenantWalletRepository,
} from '../../../../../tenant-wallet.repository';
import { success } from './billing-views';

const monthOf = (date: string) => date.slice(0, 7);

function addTo(map: Map<string, number>, key: string, kobo: number) {
  map.set(key, (map.get(key) ?? 0) + kobo);
}

@Injectable()
export class GetTenantBillingOverviewUseCase {
  constructor(
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(PAYMENT_HISTORY_REPOSITORY) private readonly payments: PaymentHistoryRepository,
    @Inject(TENANT_WALLET_REPOSITORY) private readonly wallet: TenantWalletRepository,
  ) {}

  async execute(tenantId: string, now = new Date()) {
    const today = lagosDate(now);
    const [facts, paid, open, wallet] = await Promise.all([
      this.invoices.listFactsForTenant(tenantId),
      this.payments.listPaidForTenant(tenantId),
      this.invoices.listForTenant({ tenantId, scope: 'open', today, page: 1, limit: 1 }),
      this.wallet.findByTenantId(tenantId),
    ]);

    const invoiced = new Map<string, number>();
    const settled = new Map<string, number>();
    facts.forEach((fact) => addTo(invoiced, monthOf(fact.issueDate), fact.totalKobo));
    paid.forEach((payment) => addTo(settled, monthOf(lagosDate(payment.paidAt)), payment.amountKobo));
    const months = [...new Set([...invoiced.keys(), ...settled.keys()])].sort();

    const licensing = facts.reduce((sum, fact) => sum + fact.licensingKobo, 0);
    const installation = facts.reduce((sum, fact) => sum + fact.installationKobo, 0);
    const thisYear = today.slice(0, 4);

    return success({
      summary: {
        outstandingNgn: koboToNgn(open.openTotalKobo),
        nextDueDate: open.nextDueDate,
        paidThisYearNgn: koboToNgn(
          paid
            .filter((payment) => lagosDate(payment.paidAt).startsWith(thisYear))
            .reduce((sum, payment) => sum + payment.amountKobo, 0),
        ),
        walletBalanceNgn: koboToNgn(wallet?.balanceKobo ?? 0),
      },
      spendTrend: months.map((month) => ({
        month,
        invoicedNgn: koboToNgn(invoiced.get(month) ?? 0),
        paidNgn: koboToNgn(settled.get(month) ?? 0),
      })),
      spendByCategory: [
        { name: 'Licensing', valueNgn: koboToNgn(licensing) },
        { name: 'Installation', valueNgn: koboToNgn(installation) },
      ]
        .filter((slice) => slice.valueNgn > 0)
        .sort((a, b) => b.valueNgn - a.valueNgn),
      outstandingTrend: facts.map((fact) => ({
        date: fact.issueDate,
        invoiceNumber: fact.number,
        outstandingNgn: koboToNgn(Math.max(fact.totalKobo - fact.amountPaidKobo, 0)),
      })),
    });
  }
}

type ActivityEvent = {
  id: string;
  occurredAt: Date;
  event: string;
  resource: string;
  impactKobo: number | null;
};

export type ListTenantActivityInput = { q?: string; event?: string; page?: number; pageSize?: number };

const QUOTATION_PAGE = 500;
const SOURCE_LIMIT = 500;
const devices = (count: number) => `${count} ${count === 1 ? 'device' : 'devices'}`;

@Injectable()
export class ListTenantBillingActivityUseCase {
  constructor(
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(PAYMENT_HISTORY_REPOSITORY) private readonly payments: PaymentHistoryRepository,
    @Inject(QUOTATION_REPOSITORY) private readonly quotations: QuotationRepository,
    @Inject(LICENCE_PERIOD_REPOSITORY) private readonly periods: LicencePeriodRepository,
    @Inject(DEVICE_SETUP_REQUEST_REPOSITORY) private readonly deviceRequests: DeviceSetupRequestRepository,
    @Inject(TENANT_FIELD_ACTIVITY_READER) private readonly fieldActivity: TenantFieldActivityReader,
  ) {}

  async execute(tenantId: string, input: ListTenantActivityInput, now = new Date()) {
    const paging = clampPage(input.page, input.pageSize);
    const all = (await this.collect(tenantId, now)).sort(
      (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id),
    );
    const needle = input.q?.trim().toLowerCase();
    const matching = all
      .filter((entry) => !input.event || entry.event === input.event)
      .filter((entry) => !needle || `${entry.event} ${entry.resource}`.toLowerCase().includes(needle));
    const offset = (paging.page - 1) * paging.limit;
    return success({
      items: matching.slice(offset, offset + paging.limit).map((entry) => ({
        id: entry.id,
        date: lagosDate(entry.occurredAt),
        event: entry.event,
        resource: entry.resource,
        impactNgn: entry.impactKobo === null ? null : koboToNgn(entry.impactKobo),
      })),
      events: [...new Set(all.map((entry) => entry.event))].sort(),
      total: matching.length,
      page: paging.page,
      pageSize: paging.limit,
    });
  }

  private async collect(tenantId: string, now: Date): Promise<ActivityEvent[]> {
    const groups = await Promise.all([
      this.billingEvents(tenantId),
      this.quotationEvents(tenantId, now),
      this.licenceEvents(tenantId),
      this.fleetEvents(tenantId),
    ]);
    return groups.flat();
  }

  private async billingEvents(tenantId: string): Promise<ActivityEvent[]> {
    const [facts, paid] = await Promise.all([
      this.invoices.listFactsForTenant(tenantId),
      this.payments.listPaidForTenant(tenantId),
    ]);
    return [
      ...facts.map((fact) => ({
        id: `invoice:${fact.id}`,
        occurredAt: fact.createdAt,
        event: 'Invoice Issued',
        resource: fact.number,
        impactKobo: fact.totalKobo,
      })),
      ...paid.map((payment) => ({
        id: `payment:${payment.id}`,
        occurredAt: payment.paidAt,
        event: 'Payment Received',
        resource: payment.reference,
        impactKobo: -payment.amountKobo,
      })),
    ];
  }

  private async quotationEvents(tenantId: string, now: Date): Promise<ActivityEvent[]> {
    const events: ActivityEvent[] = [];
    for (let page = 1; ; page += 1) {
      const { items, total } = await this.quotations.listForTenant({ tenantId, page, limit: QUOTATION_PAGE, now });
      items.forEach(({ quotation }) => {
        if (quotation.sentAt) {
          events.push(this.quotationEvent(quotation.id, 'sent', 'Quotation Sent', quotation.number, quotation.sentAt));
        }
        if (quotation.acceptedAt) {
          events.push(
            this.quotationEvent(quotation.id, 'accepted', 'Quotation Accepted', quotation.number, quotation.acceptedAt),
          );
        }
      });
      if (items.length === 0 || page * QUOTATION_PAGE >= total) return events;
    }
  }

  private async licenceEvents(tenantId: string): Promise<ActivityEvent[]> {
    const [periods, requests] = await Promise.all([
      this.periods.listByTenant(tenantId),
      this.deviceRequests.findAll({ tenantId }),
    ]);
    return [
      ...periods
        .filter((period) => period.origin === 'renewal')
        .map((period) => ({
          id: `renewal:${period.id}`,
          occurredAt: period.createdAt,
          event: 'Licence Renewed',
          resource: `${period.planCode} — ${devices(period.deviceCount)}`,
          impactKobo: null,
        })),
      ...requests.map((request) => ({
        id: `device-request:${request.id}`,
        occurredAt: request.createdAt,
        event: 'New Device Requested',
        resource: `${request.referenceNumber} — ${devices(request.quantity)}`,
        impactKobo: null,
      })),
    ];
  }

  private async fleetEvents(tenantId: string): Promise<ActivityEvent[]> {
    const events = await this.fieldActivity.list(tenantId, SOURCE_LIMIT);
    return events.map((entry) => ({ ...entry, impactKobo: null }));
  }

  private quotationEvent(id: string, step: string, event: string, number: string, at: Date): ActivityEvent {
    return { id: `quotation:${id}:${step}`, occurredAt: at, event, resource: number, impactKobo: null };
  }
}
