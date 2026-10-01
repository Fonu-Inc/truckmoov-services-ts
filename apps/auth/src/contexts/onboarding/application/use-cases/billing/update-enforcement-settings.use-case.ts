import { Inject, Injectable } from '@nestjs/common';
import { BillingValidationError } from '@auth/onboarding/domain/billing-errors';
import { BILLING_AUDIT, type BillingActor, type BillingAudit } from '@auth/onboarding/domain/ports/billing-audit.port';
import { ForbiddenError } from '@auth/session';
import {
  ENFORCEMENT_LIMITS,
  ENFORCEMENT_SETTINGS_REPOSITORY,
  type EnforcementSettings,
  type EnforcementSettingsPatch,
  type EnforcementSettingsRepository,
} from '../../../../../enforcement-settings.repository';
import { assertStaff, isSuperAdmin } from './enforcement-access';
import { settingsView } from './enforcement-views';
import { success } from './billing-views';

export type UpdateEnforcementSettingsInput = {
  graceDays?: unknown;
  renewalLeadDays?: unknown;
  autoSuspendEnabled?: unknown;
  autoSuspendCapPerRun?: unknown;
  paused?: unknown;
  reason?: unknown;
};

type SettingKey = keyof EnforcementSettingsPatch;
type Change = { key: SettingKey; from: number | boolean; to: number | boolean };

const SETTING_KEYS: SettingKey[] = ['graceDays', 'renewalLeadDays', 'autoSuspendEnabled', 'autoSuspendCapPerRun', 'paused'];

const LABELS: Record<SettingKey, string> = {
  graceDays: 'grace days',
  renewalLeadDays: 'renewal invoice lead time (days)',
  autoSuspendEnabled: 'automatic suspension',
  autoSuspendCapPerRun: 'customers per run limit',
  paused: 'pause all automatic actions',
};

function wholeNumber(value: unknown, range: { min: number; max: number }, label: string): number {
  const ok = typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max;
  if (!ok) {
    throw new BillingValidationError(label, `${label} must be a whole number from ${range.min} to ${range.max}.`);
  }
  return value as number;
}

function flag(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new BillingValidationError(label, `${label} must be on or off.`);
  return value;
}

export function parseEnforcementPatch(input: UpdateEnforcementSettingsInput): EnforcementSettingsPatch {
  const patch: EnforcementSettingsPatch = {};
  if (input.graceDays !== undefined) {
    patch.graceDays = wholeNumber(input.graceDays, ENFORCEMENT_LIMITS.graceDays, 'Grace days');
  }
  if (input.renewalLeadDays !== undefined) {
    patch.renewalLeadDays = wholeNumber(
      input.renewalLeadDays,
      ENFORCEMENT_LIMITS.renewalLeadDays,
      'Renewal invoice lead time',
    );
  }
  if (input.autoSuspendCapPerRun !== undefined) {
    patch.autoSuspendCapPerRun = wholeNumber(
      input.autoSuspendCapPerRun,
      ENFORCEMENT_LIMITS.autoSuspendCapPerRun,
      'Customers per run limit',
    );
  }
  if (input.autoSuspendEnabled !== undefined) {
    patch.autoSuspendEnabled = flag(input.autoSuspendEnabled, 'Automatic suspension');
  }
  if (input.paused !== undefined) patch.paused = flag(input.paused, 'Pause all automatic actions');
  if (Object.keys(patch).length === 0) {
    throw new BillingValidationError('settings', 'Change at least one setting.');
  }
  return patch;
}

export function requireEnforcementReason(value: unknown): string {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length < 5 || reason.length > 500) {
    throw new BillingValidationError('reason', 'Please give a reason of 5 to 500 characters.');
  }
  return reason;
}

export function diffSettings(current: EnforcementSettings, patch: EnforcementSettingsPatch): Change[] {
  return SETTING_KEYS.flatMap((key) => {
    const to = patch[key];
    return to === undefined || to === current[key] ? [] : [{ key, from: current[key], to }];
  });
}

export function assertMayApply(actor: BillingActor, changes: Change[]): void {
  for (const change of changes) {
    const needsSuper =
      (change.key === 'autoSuspendEnabled' && change.to === true) ||
      (change.key === 'paused' && change.to === false);
    if (needsSuper && !isSuperAdmin(actor)) {
      const message =
        change.key === 'paused'
          ? 'Only a super admin can resume automatic actions after they were paused.'
          : 'Only a super admin can switch automatic suspension on.';
      throw new ForbiddenError(message);
    }
  }
}

function describe(change: Change): string {
  if (typeof change.to === 'boolean') {
    const state = change.to ? 'on' : 'off';
    return `${LABELS[change.key]} turned ${state}`;
  }
  return `${LABELS[change.key]} changed from ${change.from} to ${change.to}`;
}

@Injectable()
export class UpdateEnforcementSettingsUseCase {
  constructor(
    @Inject(ENFORCEMENT_SETTINGS_REPOSITORY) private readonly settings: EnforcementSettingsRepository,
    @Inject(BILLING_AUDIT) private readonly audit: BillingAudit,
  ) {}

  async execute(actor: BillingActor, input: UpdateEnforcementSettingsInput) {
    assertStaff(actor, 'Only system admins can change these settings.');
    const patch = parseEnforcementPatch(input);
    const reason = requireEnforcementReason(input.reason);
    const current = await this.settings.get();
    const changes = diffSettings(current, patch);
    assertMayApply(actor, changes);
    if (changes.length === 0) return success(settingsView(current));

    const applied = Object.fromEntries(changes.map((change) => [change.key, change.to]));
    const updated = await this.settings.update(applied, actor.userId);
    await this.recordAudit(actor, changes, reason);
    return success(settingsView(updated));
  }

  private async recordAudit(actor: BillingActor, changes: Change[], reason: string) {
    await this.audit.record(actor, {
      action: 'system.billing.enforcement_settings_changed',
      entityType: 'billing_enforcement_settings',
      entityId: 'system',
      summary: `Non-payment settings: ${changes.map(describe).join('; ')}`,
      metadata: { changes, reason },
    });
  }
}
