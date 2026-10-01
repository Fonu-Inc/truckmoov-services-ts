import { koboToNgn } from '@auth/onboarding/domain/quotation-totals';
import { computeTiming, suspensionReason } from '@auth/onboarding/domain/enforcement-stage';
import type { EnforcementStagedRow, EnforcementSummaryTotals } from '../../../../../enforcement-queries.repository';
import type { EnforcementPlan, PlanRow } from '../../../../../enforcement-plan.service';
import {
  ENFORCEMENT_LIMITS,
  type EnforcementSettings,
} from '../../../../../enforcement-settings.repository';

export const DEFERRED_LABELS = {
  waived: 'Staff chose to keep this customer active for this debt',
  no_notice_yet: 'Notice not yet delivered',
  no_contact: 'No email address on file to warn the customer',
  capped: 'Waiting for the next run (per-run limit reached)',
} as const;

export const PREVIEW_NOTES = {
  sims: 'SIMs are marked suspended in our system; the mobile network is not told.',
  apiKeys:
    'Sign-in, portal and API access stop with the user accounts. Separate customer API keys do not exist yet.',
  scope: 'Only unpaid invoices and unpaid SIM monthly charges are checked today.',
} as const;

export type AssetCountsView = {
  users: number;
  devices: number;
  sims: number;
  vehicles: number;
  shareLinks: number;
};

export function settingsView(settings: EnforcementSettings) {
  return { ...settings, limits: ENFORCEMENT_LIMITS };
}

export function enforcementItemView(row: EnforcementStagedRow, graceDays: number, today: string) {
  const timing = computeTiming(row.dueDate, graceDays, today);
  const stuck = row.items === 0;
  return {
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    dueDate: row.dueDate,
    daysOverdue: stuck ? 0 : timing.daysOverdue,
    graceEndsAt: row.graceEndsOn,
    graceDaysLeft: stuck ? null : timing.graceDaysLeft,
    stage: row.stage,
    amountOwedNgn: koboToNgn(row.owedKobo),
    sources: row.sources,
    items: row.items,
    suspended: row.suspendedAt !== null,
    suspensionCause: row.suspensionCause,
    suspendedAt: row.suspendedAt,
    reason: row.reason,
    cascadeStatus: row.cascadeStatus,
    lastNoticeKind: row.lastNoticeKind,
    lastNoticeAt: row.lastNoticeAt,
    hasContact: row.hasContact,
  };
}

export function summaryView(totals: EnforcementSummaryTotals) {
  return {
    inGrace: totals.inGrace,
    pastGrace: totals.pastGrace,
    suspendedNonPayment: totals.suspendedNonPayment,
    suspendedManual: totals.suspendedManual,
    owedNgn: koboToNgn(totals.owedKobo),
  };
}

const NO_ASSETS: AssetCountsView = { users: 0, devices: 0, sims: 0, vehicles: 0, shareLinks: 0 };

function suspendView(row: PlanRow, graceDays: number, today: string, assets?: AssetCountsView) {
  const timing = computeTiming(row.dueDate, graceDays, today);
  return {
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    dueDate: row.dueDate,
    daysOverdue: timing.daysOverdue,
    amountOwedNgn: koboToNgn(row.owedKobo),
    reason: suspensionReason(row.dueDate, graceDays),
    assets: assets ?? NO_ASSETS,
  };
}

export function previewView(
  plan: EnforcementPlan,
  generatedAt: Date,
  assets: Map<string, AssetCountsView>,
) {
  const byId = new Map(plan.rows.map((row) => [row.tenantId, row]));
  const { settings, today } = plan;
  return {
    generatedAt: generatedAt.toISOString(),
    today,
    settings: {
      graceDays: settings.graceDays,
      autoSuspendEnabled: settings.autoSuspendEnabled,
      autoSuspendCapPerRun: settings.autoSuspendCapPerRun,
      paused: settings.paused,
    },
    wouldNotify: plan.wouldNotify.map((entry) => ({
      tenantId: entry.tenantId,
      tenantName: byId.get(entry.tenantId)?.tenantName ?? entry.tenantId,
      kind: entry.kind,
      daysLeft: entry.daysLeft,
      amountOwedNgn: koboToNgn(byId.get(entry.tenantId)?.owedKobo ?? 0),
      alreadySent: entry.alreadySent,
    })),
    wouldSuspend: plan.wouldSuspend.map((row) =>
      suspendView(row, settings.graceDays, today, assets.get(row.tenantId)),
    ),
    deferred: plan.deferred.map((entry) => ({
      tenantId: entry.tenantId,
      tenantName: byId.get(entry.tenantId)?.tenantName ?? entry.tenantId,
      why: entry.why,
      label: DEFERRED_LABELS[entry.why],
    })),
    totalEligible: plan.totalEligible,
    cappedCount: plan.deferred.filter((entry) => entry.why === 'capped').length,
    notes: PREVIEW_NOTES,
  };
}
