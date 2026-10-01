import { Inject, Injectable } from '@nestjs/common';
import { MailerService } from '@shared/mailer';
import {
  BILLING_INVOICE_SUBJECT,
  BILLING_INVOICE_TEMPLATE,
} from '@auth/templates/billing-invoice.template';
import type {
  InvoiceEmail,
  InvoiceNotifier,
} from '@auth/onboarding/domain/ports/invoice-notifier.port';

const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

@Injectable()
export class MailerInvoiceNotifier implements InvoiceNotifier {
  constructor(@Inject(MailerService) private readonly mailer: MailerService) {}

  async sendInvoice(input: InvoiceEmail): Promise<void> {
    await this.mailer.send({
      to: input.email,
      subject: BILLING_INVOICE_SUBJECT.replace('{{invoiceNumber}}', input.invoiceNumber),
      template: BILLING_INVOICE_TEMPLATE,
      variables: {
        customerName: escapeHtml(input.customerName),
        invoiceNumber: input.invoiceNumber,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        totalNgn: naira.format(input.totalNgn),
        amountPaidNgn: naira.format(input.amountPaidNgn),
        outstandingNgn: naira.format(input.outstandingNgn),
        year: String(new Date().getFullYear()),
      },
    });
  }
}
