import { Inject, Injectable } from '@nestjs/common';
import { BillingValidationError } from '@auth/onboarding/domain/billing-errors';
import { lagosDate } from '@auth/onboarding/domain/invoice-dates';
import type { EnforcementStage } from '@auth/onboarding/domain/enforcement-stage';
import type { BillingActor } from '@auth/onboarding/domain/ports/billing-audit.port';
import {
  ENFORCEMENT_QUERIES_REPOSITORY,
  type EnforcementQueriesRepository,
} from '../../../../../enforcement-queries.repository';
import {
  ENFORCEMENT_SETTINGS_REPOSITORY,
  type EnforcementSettingsRepository,
} from '../../../../../enforcement-settings.repository';
import { assertStaff } from './enforcement-access';
import { enforcementItemView, summaryView } from './enforcement-views';
import { success } from './billing-views';

const STAGES = ['all', 'current', 'in_grace', 'past_grace'] as const;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export type ListEnforcementInput = {
  stage?: string;
  suspended?: string | boolean;
  q?: string;
  page?: number;
  pageSize?: number;
};

function parseStage(value: string | undefined): EnforcementStage | 'all' {
  if (value === undefined) return 'all';
  if (!(STAGES as readonly string[]).includes(value)) {
    throw new BillingValidationError('stage', 'Stage must be all, current, in_grace or past_grace.');
  }
  return value as EnforcementStage | 'all';
}

function parseSuspended(value: string | boolean | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new BillingValidationError('suspended', 'Suspended must be true or false.');
}

function clampPage(page: number | undefined, pageSize: number | undefined) {
  return {
    page: Math.max(1, Math.floor(page ?? 1)),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize ?? DEFAULT_PAGE_SIZE))),
  };
}

@Injectable()
export class ListEnforcementUseCase {
  constructor(
    @Inject(ENFORCEMENT_QUERIES_REPOSITORY) private readonly queries: EnforcementQueriesRepository,
    @Inject(ENFORCEMENT_SETTINGS_REPOSITORY) private readonly settings: EnforcementSettingsRepository,
  ) {}

  async execute(actor: BillingActor, input: ListEnforcementInput, now: Date = new Date()) {
    assertStaff(actor, 'Only system admins can view who is behind on payment.');
    const stage = parseStage(input.stage);
    const suspended = parseSuspended(input.suspended);
    const paging = clampPage(input.page, input.pageSize);
    const { graceDays } = await this.settings.get();
    const today = lagosDate(now);

    const [list, totals] = await Promise.all([
      this.queries.page({ graceDays, today, stage, suspended, q: input.q, ...paging }),
      this.queries.summary(graceDays, today),
    ]);
    return success({
      items: list.rows.map((row) => enforcementItemView(row, graceDays, today)),
      ...paging,
      total: list.total,
      summary: summaryView(totals),
    });
  }
}
