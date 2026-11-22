import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import { BillingNotFoundError } from '@auth/onboarding/domain/billing-errors';
import { lagosDate } from '@auth/onboarding/domain/invoice-dates';
import {
  INVOICE_REPOSITORY,
  outstandingKobo,
  planFactsOf,
  type InvoiceRepository,
  type InvoiceWithLines,
} from '@auth/onboarding/domain/invoice.repository';
import { MAX_CARD_KOBO } from '@auth/onboarding/domain/licence-renewal';
import {
  ONBOARDING_PAYMENT_REPOSITORY,
  type OnboardingPaymentRepository,
  type StoredOnboardingPayment,
} from '@auth/onboarding/domain/onboarding-payment.repository';
import {
  RenewalAmountTooLargeError,
  RenewalInsufficientBalanceError,
  RenewalNotPayableError,
} from '@auth/onboarding/domain/renewal-errors';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';
import {
  PAYMENT_GATEWAY,
  PaymentGatewayError,
  type PaymentGateway,
} from '../../../../payments';
import {
  ENFORCEMENT_SETTINGS_REPOSITORY,
  type EnforcementSettingsRepository,
} from '../../../../../enforcement-settings.repository';
import {
  TENANT_WALLET_REPOSITORY,
  type TenantWalletRepository,
} from '../../../../../tenant-wallet.repository';
import {
  WALLET_LEDGER_REPOSITORY,
  type WalletLedgerRepository,
} from '../../../../../wallet-ledger.repository';
import { SettleRenewalPaymentUseCase } from '../../settle-renewal-payment.use-case';
import { ChargeRefusedError, PaymentProviderUnavailableError } from '../pay-for-application.use-cases';
import { success } from './billing-views';
import { isPayable, tenantInvoiceView } from './tenant-invoice-views';

type PayableInvoice = InvoiceWithLines & { isRenewal: boolean };

const RECOVERY_DELAY_MS = 10 * 60 * 1000;
const RECOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CHECKOUT_REUSE_MS = 24 * 60 * 60 * 1000;

async function loadPayable(
  invoices: InvoiceRepository,
  tenantId: string,
  invoiceId: string,
): Promise<PayableInvoice> {
  const invoice = await invoices.findForTenant(tenantId, invoiceId);
  if (!invoice) throw new BillingNotFoundError('Invoice not found');
  if (!invoice.applicationId || !isPayable(invoice, invoice.isRenewal)) throw new RenewalNotPayableError();
  return invoice;
}

function pendingPayment(
  invoice: PayableInvoice,
  fields: { id: string; reference: string; provider: string; amountKobo: number; method: 'wallet' | null },
  now: Date,
): StoredOnboardingPayment {
  const line = invoice.lines.find((candidate) => candidate.kind === 'plan' && candidate.isRenewal);
  return {
    ...fields,
    applicationId: invoice.applicationId as string,
    tenantId: invoice.tenantId,
    authorizationUrl: null,
    billingEmail: invoice.billingEmail,
    planCode: line?.planCode ?? '',
    deviceCount: line?.quantity ?? 0,
    orderSummary: null,
    quotationId: null,
    invoiceId: invoice.id,
    customerName: invoice.customerName,
    note: null,
    autoReconciled: true,
    status: 'pending',
    paidAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

@Injectable()
export class PayRenewalFromWalletUseCase {
  private readonly logger = new Logger(PayRenewalFromWalletUseCase.name);

  constructor(
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY) private readonly payments: OnboardingPaymentRepository,
    @Inject(TENANT_WALLET_REPOSITORY) private readonly wallet: TenantWalletRepository,
    @Inject(SettleRenewalPaymentUseCase) private readonly settle: SettleRenewalPaymentUseCase,
    @Inject(ENFORCEMENT_SETTINGS_REPOSITORY) private readonly settings: EnforcementSettingsRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(WALLET_LEDGER_REPOSITORY) private readonly ledger: WalletLedgerRepository,
  ) {}

  /** Finishes wallet renewals whose debit landed but whose settlement never ran, so the money reaches the invoice or comes back. */
  async recoverStale(now = new Date()): Promise<number> {
    const attempts = await this.payments.findWalletRenewalAttempts(
      new Date(now.getTime() - RECOVERY_WINDOW_MS),
      new Date(now.getTime() - RECOVERY_DELAY_MS),
    );
    let recovered = 0;
    for (const payment of attempts) {
      try {
        if (await this.recover(payment, now)) recovered += 1;
      } catch (error) {
        this.logger.error(`renewal_recovery_failed:${payment.reference}:${String(error)}`);
      }
    }
    return recovered;
  }

  private async recover(payment: StoredOnboardingPayment, now: Date): Promise<boolean> {
    const invoice = payment.invoiceId ? await this.invoices.findById(payment.invoiceId) : null;
    if (!invoice?.tenantId) return false;
    // A paid row is counted in a paid invoice's total; a pending one never is, so it settles or comes back as a duplicate.
    if (payment.status === 'paid' && invoice.status === 'paid') return false;
    const debit = await this.ledger.findByIdempotencyKey(invoice.tenantId, this.key('renewal', invoice, payment));
    if (!debit) return false;
    await this.payments.settlePending(payment.id, 'paid', now, { method: 'wallet', autoReconciled: true });
    await this.settleOrRefund(invoice.tenantId, invoice, payment, now);
    return true;
  }

  async execute(tenantId: string, invoiceId: string, now = new Date()) {
    const invoice = await loadPayable(this.invoices, tenantId, invoiceId);
    const payment = await this.pendingRow(invoice, now);
    await this.debit(tenantId, invoice, payment);
    await this.payments.settlePending(payment.id, 'paid', now, { method: 'wallet', autoReconciled: true });

    const settled = await this.settleOrRefund(tenantId, invoice, payment, now);
    const [fresh, { graceDays }] = await Promise.all([
      this.invoices.findForTenant(tenantId, invoice.id),
      this.settings.get(),
    ]);
    const current = fresh ?? invoice;
    return success({
      invoice: tenantInvoiceView(current, {
        isRenewal: true,
        periodEnd: null,
        graceDays,
        today: lagosDate(now),
        plan: planFactsOf(current.lines),
      }),
      paidFromWalletNgn: koboToNgn(payment.amountKobo),
      newPeriodEnd: settled.newPeriodEnd,
    });
  }

  private async pendingRow(invoice: PayableInvoice, now: Date): Promise<StoredOnboardingPayment> {
    const reference = `RNW-W-${invoice.number}`;
    const existing = await this.payments.findByReference(reference);
    if (existing && (existing.status === 'pending' || existing.status === 'paid')) return existing;
    const row = pendingPayment(
      invoice,
      {
        id: this.ids.generate(),
        reference: existing ? `${reference}-${randomBytes(4).toString('hex')}` : reference,
        provider: 'wallet',
        amountKobo: outstandingKobo(invoice),
        method: 'wallet',
      },
      now,
    );
    await this.payments.save(row);
    return row;
  }

  private async debit(tenantId: string, invoice: PayableInvoice, payment: StoredOnboardingPayment) {
    await this.wallet.ensure(tenantId);
    const debited = await this.wallet.debit(tenantId, payment.amountKobo, {
      category: 'subscription',
      quantity: 1,
      unitRateKobo: payment.amountKobo,
      reason: `Licence renewal ${invoice.number}`,
      reference: invoice.number,
      idempotencyKey: this.key('renewal', invoice, payment),
    });
    if (debited.ok) return;
    if (payment.status === 'pending') await this.payments.deleteUnstarted(payment.id);
    const balance = (await this.wallet.findByTenantId(tenantId))?.balanceKobo ?? 0;
    throw new RenewalInsufficientBalanceError(Math.max(payment.amountKobo - balance, 0));
  }

  private async settleOrRefund(
    tenantId: string,
    invoice: InvoiceWithLines,
    payment: StoredOnboardingPayment,
    now: Date,
  ) {
    try {
      return await this.settle.execute({ reference: payment.reference }, now);
    } catch (error) {
      await this.tryRefund(tenantId, invoice, payment);
      throw error;
    }
  }

  private key(prefix: string, invoice: InvoiceWithLines, payment: StoredOnboardingPayment): string {
    const first = payment.reference === `RNW-W-${invoice.number}`;
    return first ? `${prefix}:${invoice.id}` : `${prefix}:${invoice.id}:${payment.id}`;
  }

  private async tryRefund(tenantId: string, invoice: InvoiceWithLines, payment: StoredOnboardingPayment) {
    try {
      const [current, stored] = await Promise.all([
        this.payments.findByReference(payment.reference),
        this.invoices.findById(invoice.id),
      ]);
      if (current?.status !== 'paid' || stored?.status === 'paid') return;
      await this.wallet.credit(tenantId, payment.amountKobo, {
        category: 'refund',
        quantity: 1,
        unitRateKobo: payment.amountKobo,
        reason: `Refund: licence renewal ${invoice.number} could not be completed`,
        reference: invoice.number,
        idempotencyKey: this.key('renewal-refund', invoice, payment),
      });
      await this.payments.save({ ...current, status: 'refunded', note: 'Refunded: renewal could not be completed' });
    } catch (refundError) {
      this.logger.error(`renewal_refund_failed:${invoice.number}:${String(refundError)}`);
    }
  }
}

@Injectable()
export class PayRenewalByCardUseCase {
  private readonly logger = new Logger(PayRenewalByCardUseCase.name);

  constructor(
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    @Inject(ONBOARDING_PAYMENT_REPOSITORY) private readonly payments: OnboardingPaymentRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Optional()
    @Inject(SettleRenewalPaymentUseCase)
    private readonly settle?: SettleRenewalPaymentUseCase,
  ) {}

  async execute(tenantId: string, invoiceId: string, now = new Date()) {
    const invoice = await loadPayable(this.invoices, tenantId, invoiceId);
    const amountKobo = outstandingKobo(invoice);
    if (amountKobo > MAX_CARD_KOBO) throw new RenewalAmountTooLargeError();
    if (!this.gateway.demo && !this.gateway.isConfigured()) {
      throw new PaymentProviderUnavailableError();
    }

    // A second click returns the checkout already started, so the customer cannot be charged twice for one invoice.
    const started = await this.startedCheckout(invoice, amountKobo, now);
    if (started) {
      return success({
        authorizationUrl: started.authorizationUrl,
        reference: started.reference,
        amountNgn: koboToNgn(amountKobo),
      });
    }

    const payment = pendingPayment(
      invoice,
      {
        id: this.ids.generate(),
        reference: `RNW-${invoice.number}-${randomBytes(6).toString('hex')}`,
        provider: this.gateway.name,
        amountKobo,
        method: null,
      },
      now,
    );
    await this.payments.save(payment);
    if (this.gateway.demo) {
      if (!this.settle) {
        throw new Error('Demo renewal settlement is not configured');
      }
      const settled = await this.settle.execute(
        {
          reference: payment.reference,
          gateway: {
            succeeded: true,
            paid: {
              amountKobo: payment.amountKobo,
              currency: 'NGN',
              channel: 'demo',
            },
          },
        },
        now,
      );
      this.logger.log(`renewal_payment_demo_confirmed:${payment.reference}`);
      return success({
        authorizationUrl: null,
        reference: payment.reference,
        amountNgn: koboToNgn(amountKobo),
        newPeriodEnd: settled.newPeriodEnd,
        paid: true,
      });
    }
    const authorizationUrl = await this.charge(payment, invoice);
    this.logger.log(`renewal_payment_started:${payment.reference}`);
    return success({ authorizationUrl, reference: payment.reference, amountNgn: koboToNgn(amountKobo) });
  }

  private async startedCheckout(invoice: PayableInvoice, amountKobo: number, now: Date) {
    if (this.gateway.demo) return null;
    const rows = await this.payments.findByInvoiceId(invoice.id);
    return (
      rows.find(
        (row) =>
          row.status === 'pending' &&
          row.provider === this.gateway.name &&
          row.amountKobo === amountKobo &&
          row.authorizationUrl !== null &&
          now.getTime() - row.createdAt.getTime() < CHECKOUT_REUSE_MS,
      ) ?? null
    );
  }

  private async charge(payment: StoredOnboardingPayment, invoice: PayableInvoice): Promise<string | null> {
    try {
      const charge = await this.gateway.initiateCharge({
        reference: payment.reference,
        amountKobo: payment.amountKobo,
        customerEmail: invoice.billingEmail,
        metadata: { kind: 'renewal', renewalInvoiceId: invoice.id, applicationId: payment.applicationId },
      });
      await this.payments.setAuthorizationUrl(payment.id, charge.authorizationUrl);
      return charge.authorizationUrl;
    } catch (error) {
      await this.payments.deleteUnstarted(payment.id);
      if (!(error instanceof PaymentGatewayError)) throw error;
      this.logger.warn(`renewal_payment_refused:${payment.reference}:${error.provider}:${error.message}`);
      throw new ChargeRefusedError();
    }
  }
}
