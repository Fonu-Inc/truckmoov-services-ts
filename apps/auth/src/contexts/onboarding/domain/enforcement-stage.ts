import { addDaysToDate } from './invoice-dates';

export type EnforcementStage = 'current' | 'in_grace' | 'past_grace';
export type NoticeKind =
  | 'due_today'
  | 'grace_daily'
  | 'final'
  | 'suspended'
  | 'restored'
  | 'renewal_issued';
export type ScheduledNoticeKind = 'due_today' | 'grace_daily' | 'final';

export type StageTiming = {
  stage: EnforcementStage;
  graceEndsOn: string;
  daysOverdue: number;
  graceDaysLeft: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function computeTiming(dueDate: string, graceDays: number, today: string): StageTiming {
  const graceEndsOn = addDaysToDate(dueDate, graceDays);
  const daysOverdue = Math.max(0, daysBetween(dueDate, today));
  if (today <= dueDate) return { stage: 'current', graceEndsOn, daysOverdue, graceDaysLeft: null };
  if (today <= graceEndsOn) {
    return { stage: 'in_grace', graceEndsOn, daysOverdue, graceDaysLeft: daysBetween(today, graceEndsOn) };
  }
  return { stage: 'past_grace', graceEndsOn, daysOverdue, graceDaysLeft: 0 };
}

export function suspensionReason(dueDate: string, graceDays: number): string {
  return `Unpaid since ${dueDate}, grace of ${graceDays} days ended`;
}

export function finalNoticeDate(dueDate: string, graceDays: number): string {
  return addDaysToDate(dueDate, Math.max(graceDays - 1, 0));
}

export function noticeKindFor(input: {
  dueDate: string;
  graceDays: number;
  today: string;
  finalSent: boolean;
}): ScheduledNoticeKind | null {
  const { dueDate, graceDays, today, finalSent } = input;
  const timing = computeTiming(dueDate, graceDays, today);
  if (today === finalNoticeDate(dueDate, graceDays)) return 'final';
  if (timing.stage !== 'current' && !finalSent) return 'final';
  if (timing.stage === 'in_grace') return 'grace_daily';
  if (today === dueDate) return 'due_today';
  return null;
}

export function noticeDedupKey(input: {
  tenantId: string;
  kind: ScheduledNoticeKind;
  unpaidSince: string;
  today: string;
}): string {
  const { tenantId, kind, unpaidSince, today } = input;
  return kind === 'final'
    ? `${tenantId}|final|${unpaidSince}`
    : `${tenantId}|${kind}|${unpaidSince}|${today}`;
}
