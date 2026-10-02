import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import {
  DEFAULT_ENFORCEMENT_SETTINGS,
  type EnforcementSettings,
  type EnforcementSettingsPatch,
  type EnforcementSettingsRepository,
} from './enforcement-settings.repository';

type Row = Record<string, unknown>;

const COLUMNS: Record<keyof EnforcementSettingsPatch, string> = {
  graceDays: 'grace_days',
  renewalLeadDays: 'renewal_lead_days',
  autoSuspendEnabled: 'auto_suspend_enabled',
  autoSuspendCapPerRun: 'auto_suspend_cap_per_run',
  paused: 'paused',
  onboardingTrialDaysOverride: 'onboarding_trial_days_override',
};

export function toEnforcementSettings(row: Row | undefined): EnforcementSettings {
  if (!row) return { ...DEFAULT_ENFORCEMENT_SETTINGS };
  return {
    graceDays: Number(row.grace_days),
    renewalLeadDays: Number(row.renewal_lead_days),
    autoSuspendEnabled: Boolean(row.auto_suspend_enabled),
    autoSuspendCapPerRun: Number(row.auto_suspend_cap_per_run),
    paused: Boolean(row.paused),
    onboardingTrialDaysOverride:
      row.onboarding_trial_days_override == null ? null : Number(row.onboarding_trial_days_override),
    updatedAt: row.updated_at ? new Date(row.updated_at as string | Date).toISOString() : null,
    updatedBy: (row.updated_by as string | null) ?? null,
  };
}

@Injectable()
export class MikroEnforcementSettingsRepository implements EnforcementSettingsRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async get(): Promise<EnforcementSettings> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em
      .fork()
      .getConnection()
      .execute<Row[]>(`select * from enforcement_settings where id = 'system'`);
    return toEnforcementSettings(rows[0]);
  }

  async update(patch: EnforcementSettingsPatch, actorId: string): Promise<EnforcementSettings> {
    const keys = (Object.keys(patch) as (keyof EnforcementSettingsPatch)[]).filter(
      (key) => patch[key] !== undefined,
    );
    if (keys.length === 0) return this.get();
    const assignments = keys.map((key) => `${COLUMNS[key]} = ?`).join(', ');
    const values = keys.map((key) => patch[key]);
    const orm = await getAuthOrm(this.config.db);
    const connection = orm.em.fork().getConnection();
    await connection.execute(
      `insert into enforcement_settings (id) values ('system') on conflict do nothing`,
    );
    const rows = await connection.execute<Row[]>(
      `update enforcement_settings set ${assignments}, updated_at = now(), updated_by = ?
       where id = 'system' returning *`,
      [...values, actorId],
    );
    return toEnforcementSettings(rows[0]);
  }
}
