import { Injectable } from '@nestjs/common';
import {
  DEFAULT_ENFORCEMENT_SETTINGS,
  type EnforcementSettings,
  type EnforcementSettingsPatch,
  type EnforcementSettingsRepository,
} from './enforcement-settings.repository';
import type {
  EnforcementQueriesRepository,
  EnforcementSummaryTotals,
} from './enforcement-queries.repository';

@Injectable()
export class InMemoryEnforcementSettingsRepository implements EnforcementSettingsRepository {
  private current: EnforcementSettings = { ...DEFAULT_ENFORCEMENT_SETTINGS };

  async get(): Promise<EnforcementSettings> {
    return { ...this.current };
  }

  async update(patch: EnforcementSettingsPatch, actorId: string): Promise<EnforcementSettings> {
    const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    this.current = { ...this.current, ...defined, updatedAt: new Date().toISOString(), updatedBy: actorId };
    return this.get();
  }
}

@Injectable()
export class InMemoryEnforcementQueriesRepository implements EnforcementQueriesRepository {
  async candidates() {
    return [];
  }

  async page() {
    return { rows: [], total: 0 };
  }

  async summary(): Promise<EnforcementSummaryTotals> {
    return { inGrace: 0, pastGrace: 0, suspendedNonPayment: 0, suspendedManual: 0, owedKobo: 0 };
  }
}
