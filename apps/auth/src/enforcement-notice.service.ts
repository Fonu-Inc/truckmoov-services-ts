import { Inject, Injectable, Logger } from '@nestjs/common';
import { addDaysToDate } from '@auth/onboarding/domain/invoice-dates';
import {
  noticeDedupKey,
  type NoticeKind,
  type ScheduledNoticeKind,
} from '@auth/onboarding/domain/enforcement-stage';
import {
  ENFORCEMENT_NOTIFIER,
  type EnforcementNotifier,
} from '@auth/onboarding/domain/ports/enforcement-notifier.port';
import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';
import { ARREARS_REPOSITORY, type ArrearsRepository, type OwedItem } from './arrears.repository';
import { EnforcementAudit } from './enforcement-audit';
import {
  ENFORCEMENT_NOTICE_REPOSITORY,
  type EnforcementNoticeRepository,
} from './enforcement-notice.repository';

export type NoticeOutcome = 'sent' | 'duplicate' | 'failed' | 'no_contact';

export type ScheduledNoticeInput = {
  tenantId: string;
  kind: ScheduledNoticeKind;
  unpaidSince: string;
  graceEndsOn: string;
  graceDays: number;
  owedKobo: number;
  daysLeft: number | null;
  today: string;
};

type Draft = {
  tenantId: string;
  kind: NoticeKind;
  dedupKey: string;
  unpaidSince: string;
  graceEndsOn: string;
  graceDaysAtSend?: number;
  owedKobo: number | null;
  daysLeft: number | null;
  suspendOn: string;
  invoice?: { number: string };
};

export type RenewalNoticeInput = {
  tenantId: string;
  invoiceNumber: string;
  periodEnd: string;
  dueDate: string;
  totalKobo: number;
  graceDays: number;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function describeItem(item: OwedItem): string {
  if (item.source === 'invoice') return `Invoice ${item.reference}`;
  const month = item.reference.split(':').pop() ?? '';
  const [year, number] = month.split('-').map(Number);
  const name = MONTHS[(number ?? 0) - 1];
  return name ? `SIM monthly charge for ${name} ${year}` : 'SIM monthly charge';
}

@Injectable()
export class EnforcementNoticeService {
  private readonly logger = new Logger(EnforcementNoticeService.name);

  constructor(
    @Inject(ENFORCEMENT_NOTICE_REPOSITORY) private readonly notices: EnforcementNoticeRepository,
    @Inject(ARREARS_REPOSITORY) private readonly arrears: ArrearsRepository,
    @Inject(ENFORCEMENT_NOTIFIER) private readonly notifier: EnforcementNotifier,
    @Inject(EnforcementAudit) private readonly audit: EnforcementAudit,
  ) {}

  sendScheduled(input: ScheduledNoticeInput): Promise<NoticeOutcome> {
    const { tenantId, kind, unpaidSince, today } = input;
    const lastPauseDay = addDaysToDate(input.graceEndsOn, 1);
    const tomorrow = addDaysToDate(today, 1);
    return this.deliver({
      tenantId,
      kind,
      dedupKey: noticeDedupKey({ tenantId, kind, unpaidSince, today }),
      unpaidSince,
      graceEndsOn: input.graceEndsOn,
      graceDaysAtSend: input.graceDays,
      owedKobo: input.owedKobo,
      daysLeft: input.daysLeft,
      suspendOn: kind === 'final' && lastPauseDay < tomorrow ? tomorrow : lastPauseDay,
    });
  }

  sendRenewalIssued(input: RenewalNoticeInput): Promise<NoticeOutcome> {
    return this.deliver({
      tenantId: input.tenantId,
      kind: 'renewal_issued',
      dedupKey: `renewal_issued:${input.tenantId}:${input.periodEnd}`,
      unpaidSince: input.dueDate,
      graceEndsOn: addDaysToDate(input.dueDate, input.graceDays),
      graceDaysAtSend: input.graceDays,
      owedKobo: input.totalKobo,
      daysLeft: null,
      suspendOn: addDaysToDate(input.dueDate, input.graceDays + 1),
      invoice: { number: input.invoiceNumber },
    });
  }

  sendSuspended(input: {
    tenantId: string;
    suspendedAt: Date;
    unpaidSince: string;
    graceDays: number;
  }): Promise<NoticeOutcome> {
    return this.deliver({
      tenantId: input.tenantId,
      kind: 'suspended',
      dedupKey: `${input.tenantId}|suspended|${input.suspendedAt.toISOString()}`,
      unpaidSince: input.unpaidSince,
      graceEndsOn: addDaysToDate(input.unpaidSince, input.graceDays),
      graceDaysAtSend: input.graceDays,
      owedKobo: null,
      daysLeft: null,
      suspendOn: input.suspendedAt.toISOString().slice(0, 10),
    });
  }

  sendRestored(input: {
    tenantId: string;
    suspendedAt: Date;
    unpaidSince: string | null;
  }): Promise<NoticeOutcome> {
    const since = input.unpaidSince ?? input.suspendedAt.toISOString().slice(0, 10);
    return this.deliver({
      tenantId: input.tenantId,
      kind: 'restored',
      dedupKey: `${input.tenantId}|restored|${input.suspendedAt.toISOString()}`,
      unpaidSince: since,
      graceEndsOn: since,
      owedKobo: 0,
      daysLeft: null,
      suspendOn: since,
    });
  }

  private async deliver(draft: Draft): Promise<NoticeOutcome> {
    const contacts = await this.notices.contactsFor(draft.tenantId);
    if (contacts.emails.length === 0) return 'no_contact';

    const claim = await this.notices.claim({
      tenantId: draft.tenantId,
      kind: draft.kind,
      dedupKey: draft.dedupKey,
      unpaidSince: draft.unpaidSince,
      recipients: contacts.emails,
      graceDaysAtSend: draft.graceDaysAtSend ?? null,
    });
    if (!claim) return 'duplicate';

    const items = await this.itemsFor(draft);
    const owedKobo = draft.owedKobo ?? items.reduce((sum, item) => sum + item.owedKobo, 0);
    const delivered = await this.mailAll(contacts.emails, {
      kind: draft.kind,
      customerName: contacts.customerName,
      amountOwedNgn: koboToNgn(owedKobo),
      dueDate: draft.unpaidSince,
      graceEndsOn: draft.graceEndsOn,
      daysLeft: draft.daysLeft,
      suspendOn: draft.suspendOn,
      items: items.map(describeItem),
      invoiceNumber: draft.invoice?.number ?? null,
      graceDays: draft.graceDaysAtSend ?? null,
    });

    if (delivered.sent === 0) {
      await this.notices.markFailed(claim.id, delivered.error);
      this.logger.warn(`enforcement_notice_failed:${draft.dedupKey}:${delivered.error}`);
      return 'failed';
    }
    await this.notices.markSent(claim.id);
    await this.audit.noticeSent({
      tenantId: draft.tenantId,
      kind: draft.kind,
      recipients: delivered.sent,
      dedupKey: draft.dedupKey,
    });
    return 'sent';
  }

  private itemsFor(draft: Draft): Promise<OwedItem[]> {
    if (draft.kind === 'restored' || draft.kind === 'renewal_issued') return Promise.resolve([]);
    return this.arrears.openItems(draft.tenantId);
  }

  private async mailAll(
    emails: string[],
    body: Omit<Parameters<EnforcementNotifier['send']>[0], 'to'>,
  ): Promise<{ sent: number; error: string }> {
    let sent = 0;
    let error = '';
    for (const to of emails) {
      try {
        await this.notifier.send({ ...body, to });
        sent += 1;
      } catch (failure) {
        error = failure instanceof Error ? failure.message : 'unknown';
      }
    }
    return { sent, error };
  }
}
