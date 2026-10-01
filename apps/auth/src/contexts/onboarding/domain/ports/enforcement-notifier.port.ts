import type { NoticeKind } from '../enforcement-stage';

export type EnforcementEmail = {
  to: string;
  kind: NoticeKind;
  customerName: string;
  amountOwedNgn: number;
  dueDate: string;
  graceEndsOn: string;
  daysLeft: number | null;
  suspendOn: string;
  items: string[];
  invoiceNumber?: string | null;
  graceDays?: number | null;
};

export interface EnforcementNotifier {
  /** Throws when the mail could not be sent. */
  send(email: EnforcementEmail): Promise<void>;
}

export const ENFORCEMENT_NOTIFIER = Symbol('ENFORCEMENT_NOTIFIER');
