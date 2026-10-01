import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { MailerService } from '@shared/mailer';
import type {
  EnforcementEmail,
  EnforcementNotifier,
} from '@auth/onboarding/domain/ports/enforcement-notifier.port';
import { ENFORCEMENT_PAGE_TEMPLATE, NOTICE_COPY } from './enforcement-notice.templates';

export const SUPPORT_EMAIL = 'support@truckmoov.com';

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
}

function daysLeftText(daysLeft: number | null): string {
  if (daysLeft === null) return '';
  if (daysLeft <= 0) return 'less than a day';
  return daysLeft === 1 ? '1 day' : `${daysLeft} days`;
}

function graceDaysText(graceDays: number | null | undefined): string {
  if (graceDays == null) return '';
  if (graceDays <= 0) return 'no extra days';
  return graceDays === 1 ? '1 day' : `${graceDays} days`;
}

@Injectable()
export class MailerEnforcementNotifier implements EnforcementNotifier {
  constructor(
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async send(email: EnforcementEmail): Promise<void> {
    const copy = NOTICE_COPY[email.kind];
    const values = this.values(email);
    await this.mailer.send({
      to: email.to,
      subject: fill(copy.subject, values),
      template: ENFORCEMENT_PAGE_TEMPLATE,
      variables: {
        headline: fill(copy.headline, values),
        paragraphs: copy.paragraphs.map((text) => `<p>${fill(text, values)}</p>`).join('\n'),
        itemsBlock: copy.showItems ? this.itemsBlock(email.items) : '',
        payBlock: email.kind === 'restored' ? '' : `<p><a class="button" href="${values.payUrl}">Pay now</a></p>`,
        supportEmail: SUPPORT_EMAIL,
        year: String(new Date().getFullYear()),
      },
    });
  }

  private values(email: EnforcementEmail): Record<string, string> {
    return {
      customerName: escapeHtml(email.customerName),
      amountOwedNgn: naira.format(email.amountOwedNgn),
      dueDate: email.dueDate,
      graceEndsOn: email.graceEndsOn,
      daysLeft: daysLeftText(email.daysLeft),
      invoiceNumber: escapeHtml(email.invoiceNumber ?? ''),
      graceDays: graceDaysText(email.graceDays),
      suspendOn: email.suspendOn,
      payUrl: new URL('/billing', this.config.app.tenantAppUrl).toString(),
      supportEmail: SUPPORT_EMAIL,
    };
  }

  private itemsBlock(items: string[]): string {
    if (items.length === 0) return '';
    return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  }
}
