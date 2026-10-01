import { InMemoryInvoiceRepository } from "@auth/onboarding/infrastructure/persistence/in-memory-invoice.repository";
import { InvoiceIssuanceService } from "@auth/onboarding/application/services/invoice-issuance.service";
import type { BillingAudit, BillingAuditEntry } from "@auth/onboarding/domain/ports/billing-audit.port";
import type { InvoiceEmail, InvoiceNotifier } from "@auth/onboarding/domain/ports/invoice-notifier.port";
import type { InvoiceNumberAllocator } from "@auth/onboarding/domain/ports/invoice-number.port";
import type { InvoiceRepository } from "@auth/onboarding/domain/invoice.repository";
import type { QuotationRepository } from "@auth/onboarding/domain/quotation.repository";
import type { OnboardingPaymentRepository } from "@auth/onboarding/domain/onboarding-payment.repository";
import type { BillingSettingsRepository } from "@auth/onboarding/domain/billing-settings.repository";
import { InMemoryInvoiceNumberRepository } from "../../../apps/auth/src/in-memory-invoice-number.repository";
import { InvoiceNumberService } from "../../../apps/auth/src/invoice-number.service";
import { InvoiceSeriesInvoiceNumbers } from "../../../apps/auth/src/invoice-number.allocator";

export class RecordingNotifier implements InvoiceNotifier {
  sent: InvoiceEmail[] = [];
  failWith: Error | null = null;

  async sendInvoice(input: InvoiceEmail): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(input);
  }
}

export class RecordingAudit implements BillingAudit {
  entries: BillingAuditEntry[] = [];
  failWith: Error | null = null;

  async record(_actor: unknown, entry: BillingAuditEntry): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.entries.push(entry);
  }

  actions = () => this.entries.map((entry) => entry.action);
}

export function buildInvoiceKit(deps: {
  quotations: QuotationRepository;
  payments: OnboardingPaymentRepository;
  settings: BillingSettingsRepository;
  invoices?: InvoiceRepository;
  numbers?: InvoiceNumberAllocator;
}) {
  let ids = 0;
  const invoices = deps.invoices ?? new InMemoryInvoiceRepository(deps.payments, deps.quotations);
  const numbers =
    deps.numbers ?? new InvoiceSeriesInvoiceNumbers(new InvoiceNumberService(new InMemoryInvoiceNumberRepository()));
  const notifier = new RecordingNotifier();
  const audit = new RecordingAudit();
  const service = new InvoiceIssuanceService(
    deps.quotations,
    invoices,
    deps.payments,
    deps.settings,
    numbers,
    notifier,
    audit,
    { generate: () => `inv-id-${++ids}` },
  );
  return { invoices, notifier, audit, service };
}
