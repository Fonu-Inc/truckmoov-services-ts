import { Inject, Injectable } from '@nestjs/common';
import {
  computeTiming,
  noticeDedupKey,
  noticeKindFor,
  type EnforcementStage,
  type ScheduledNoticeKind,
} from '@auth/onboarding/domain/enforcement-stage';
import { lagosDate } from '@auth/onboarding/domain/invoice-dates';
import {
  ENFORCEMENT_QUERIES_REPOSITORY,
  type EnforcementQueriesRepository,
  type EnforcementSourceKind,
  type EnforcementStagedRow,
  type SuspensionCause,
} from './enforcement-queries.repository';
import {
  ENFORCEMENT_SETTINGS_REPOSITORY,
  type EnforcementSettings,
  type EnforcementSettingsRepository,
} from './enforcement-settings.repository';

export type PlanRow = {
  tenantId: string;
  tenantName: string;
  dueDate: string;
  graceEndsOn: string;
  stage: EnforcementStage;
  owedKobo: number;
  items: number;
  sources: EnforcementSourceKind[];
  suspended: boolean;
  suspensionCause: SuspensionCause | null;
};

export type DeferredReason = 'waived' | 'no_notice_yet' | 'no_contact' | 'capped';

export type EnforcementPlan = {
  today: string;
  settings: EnforcementSettings;
  rows: PlanRow[];
  wouldNotify: {
    tenantId: string;
    kind: ScheduledNoticeKind;
    daysLeft: number | null;
    alreadySent: boolean;
  }[];
  wouldSuspend: PlanRow[];
  deferred: { tenantId: string; why: DeferredReason }[];
  totalEligible: number;
};

function byUrgency(a: PlanRow, b: PlanRow): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  if (a.owedKobo !== b.owedKobo) return b.owedKobo - a.owedKobo;
  return a.tenantId < b.tenantId ? -1 : a.tenantId > b.tenantId ? 1 : 0;
}

function toPlanRow(staged: EnforcementStagedRow): PlanRow {
  return {
    tenantId: staged.tenantId,
    tenantName: staged.tenantName,
    dueDate: staged.dueDate,
    graceEndsOn: staged.graceEndsOn,
    stage: staged.stage,
    owedKobo: staged.owedKobo,
    items: staged.items,
    sources: staged.sources,
    suspended: staged.suspendedAt !== null,
    suspensionCause: staged.suspensionCause,
  };
}

function notice(staged: EnforcementStagedRow, settings: EnforcementSettings, today: string) {
  if (staged.suspendedAt !== null || staged.waived || !staged.hasContact) return null;
  const finalKey = noticeDedupKey({
    tenantId: staged.tenantId,
    kind: 'final',
    unpaidSince: staged.dueDate,
    today,
  });
  const kind = noticeKindFor({
    dueDate: staged.dueDate,
    graceDays: settings.graceDays,
    today,
    finalSent: staged.sentNoticeKeys.includes(finalKey),
  });
  if (!kind) return null;
  const key = noticeDedupKey({ tenantId: staged.tenantId, kind, unpaidSince: staged.dueDate, today });
  const timing = computeTiming(staged.dueDate, settings.graceDays, today);
  return {
    tenantId: staged.tenantId,
    kind,
    daysLeft: kind === 'due_today' ? null : Math.max(0, timing.graceDaysLeft ?? 0),
    alreadySent: staged.sentNoticeKeys.includes(key),
  };
}

function deferralOf(staged: EnforcementStagedRow): DeferredReason | null {
  if (staged.waived) return 'waived';
  if (!staged.hasContact) return 'no_contact';
  if (!staged.finalNoticeSentEarlier) return 'no_notice_yet';
  return null;
}

export function buildEnforcementPlan(
  staged: EnforcementStagedRow[],
  settings: EnforcementSettings,
  today: string,
): EnforcementPlan {
  const ordered = [...staged].sort((a, b) => byUrgency(toPlanRow(a), toPlanRow(b)));
  const wouldNotify = ordered.flatMap((row) => notice(row, settings, today) ?? []);

  const deferred: EnforcementPlan['deferred'] = [];
  const eligible: PlanRow[] = [];
  for (const row of ordered.filter((r) => r.stage === 'past_grace' && r.suspendedAt === null)) {
    const why = deferralOf(row);
    if (why) deferred.push({ tenantId: row.tenantId, why });
    else eligible.push(toPlanRow(row));
  }

  const wouldSuspend = eligible.slice(0, settings.autoSuspendCapPerRun);
  for (const row of eligible.slice(settings.autoSuspendCapPerRun)) {
    deferred.push({ tenantId: row.tenantId, why: 'capped' });
  }

  return {
    today,
    settings,
    rows: ordered.map(toPlanRow),
    wouldNotify,
    wouldSuspend,
    deferred,
    totalEligible: eligible.length,
  };
}

@Injectable()
export class EnforcementPlanService {
  constructor(
    @Inject(ENFORCEMENT_QUERIES_REPOSITORY) private readonly queries: EnforcementQueriesRepository,
    @Inject(ENFORCEMENT_SETTINGS_REPOSITORY) private readonly settings: EnforcementSettingsRepository,
  ) {}

  async plan(now: Date = new Date()): Promise<EnforcementPlan> {
    const settings = await this.settings.get();
    const today = lagosDate(now);
    const staged = await this.queries.candidates(settings.graceDays, today);
    return buildEnforcementPlan(staged, settings, today);
  }
}
