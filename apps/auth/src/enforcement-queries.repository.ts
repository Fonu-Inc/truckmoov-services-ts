import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { Role, roleToId } from '@shared/rbac';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type { EnforcementStage } from '@auth/onboarding/domain/enforcement-stage';

export type SuspensionCause = 'manual' | 'non_payment';

export type EnforcementSourceKind = 'invoice' | 'sim_monthly';

export type EnforcementStagedRow = {
  tenantId: string;
  tenantName: string;
  dueDate: string;
  graceEndsOn: string;
  stage: EnforcementStage;
  owedKobo: number;
  items: number;
  sources: EnforcementSourceKind[];
  suspendedAt: string | null;
  suspensionCause: SuspensionCause | null;
  reason: string | null;
  cascadeStatus: string | null;
  hasContact: boolean;
  lastNoticeKind: string | null;
  lastNoticeAt: string | null;
  waived: boolean;
  sentNoticeKeys: string[];
  finalNoticeSentEarlier: boolean;
};

export type EnforcementPageQuery = {
  graceDays: number;
  today: string;
  stage: EnforcementStage | 'all';
  suspended?: boolean;
  q?: string;
  page: number;
  pageSize: number;
};

export type EnforcementSummaryTotals = {
  inGrace: number;
  pastGrace: number;
  suspendedNonPayment: number;
  suspendedManual: number;
  owedKobo: number;
};

export interface EnforcementQueriesRepository {
  candidates(graceDays: number, today: string): Promise<EnforcementStagedRow[]>;
  page(query: EnforcementPageQuery): Promise<{ rows: EnforcementStagedRow[]; total: number }>;
  summary(graceDays: number, today: string): Promise<EnforcementSummaryTotals>;
}

export const ENFORCEMENT_QUERIES_REPOSITORY = Symbol('ENFORCEMENT_QUERIES_REPOSITORY');

export const TENANT_ADMIN_ROLES: readonly Role[] = [
  Role.ENTERPRISE_ADMIN,
  Role.AGGREGATOR_ADMIN,
  Role.OWNER_OPERATOR,
];

type Row = Record<string, unknown>;

const LAGOS = `'Africa/Lagos'`;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function adminRoleIds(): string {
  return TENANT_ADMIN_ROLES.map((role) => roleToId(role)).join(', ');
}

function assertInputs(graceDays: number, today: string): void {
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 365) {
    throw new Error('graceDays must be a whole number of days');
  }
  if (!DATE_PATTERN.test(today)) throw new Error('today must be YYYY-MM-DD');
}

function perTenantCte(): string {
  return `
  owed as (
    select coalesce(i.tenant_id, a.tenant_id) as tenant_id, i.due_date, 'invoice'::text as source,
           i.number as ref, (i.total_kobo - i.amount_paid_kobo) as owed_kobo
    from billing_invoices i
    left join onboarding_applications a on a.id = i.application_id
    where i.status in ('issued','partially_paid','overdue') and i.total_kobo > i.amount_paid_kobo
    union all
    select r.tenant_id, r.due_date, r.source::text, r.reference, r.amount_kobo
    from billing_arrears r where r.resolved_at is null
  ), per_tenant as (
    select tenant_id, min(due_date) as due_date, sum(owed_kobo) as owed_kobo, count(*) as items,
           array_agg(distinct source) as sources
    from owed
    where tenant_id is not null and tenant_id <> 'system'
      and exists (select 1 from auth_users u where u.tenant_id = owed.tenant_id)
      and not exists (select 1 from tenant_terminations t where t.tenant_id = owed.tenant_id)
    group by tenant_id
  )`;
}

function scopeCte(withStuckRestores: boolean): string {
  const stuck = withStuckRestores
    ? `union all
       select s.tenant_id, coalesce(s.unpaid_since, (s.suspended_at at time zone ${LAGOS})::date),
              0::numeric, 0::bigint, array[]::text[]
       from tenant_suspensions s
       where s.cause = 'non_payment' and s.tenant_id not in (select tenant_id from per_tenant)
         and not exists (select 1 from tenant_terminations t where t.tenant_id = s.tenant_id)`
    : '';
  return `, scope as (
    select tenant_id, due_date, owed_kobo, items, sources from per_tenant ${stuck}
  )`;
}

function rowsCte(graceDays: number, today: string): string {
  const grace = `${graceDays}::int`;
  const day = `'${today}'::date`;
  return `, staged as (
    select sc.tenant_id,
      coalesce(nullif(o.company->>'companyName', ''), nullif(os.branding->>'organizationName', ''),
               nullif(bi.company_name, ''), sc.tenant_id) as tenant_name,
      to_char(sc.due_date, 'YYYY-MM-DD') as due_date,
      to_char(sc.due_date + ${grace}, 'YYYY-MM-DD') as grace_ends_on,
      case when sc.items = 0 or ${day} <= sc.due_date then 'current'
           when ${day} <= sc.due_date + ${grace} then 'in_grace' else 'past_grace' end as stage,
      sc.owed_kobo, sc.items, sc.sources,
      s.suspended_at, s.cause, s.reason, s.cascade_status,
      (exists (select 1 from auth_users u where u.tenant_id = sc.tenant_id
                 and u.role_id in (${adminRoleIds()}) and u.email like '%_@_%')
        or coalesce(nullif(o.company->>'billingEmail', ''), nullif(o.company->>'email', ''),
                    nullif(bi.billing_email, ''), nullif(bi.email, '')) is not null) as has_contact,
      ln.kind as last_notice_kind, ln.noticed_at as last_notice_at,
      exists (select 1 from enforcement_waivers w
               where w.tenant_id = sc.tenant_id and w.unpaid_since = sc.due_date) as waived,
      coalesce((select array_agg(n.dedup_key) from enforcement_notices n
                 where n.tenant_id = sc.tenant_id and n.status = 'sent'
                   and n.unpaid_since = sc.due_date), array[]::text[]) as sent_keys,
      exists (select 1 from enforcement_notices n
               where n.tenant_id = sc.tenant_id and n.kind = 'final' and n.status = 'sent'
                 and n.unpaid_since = sc.due_date
                 and (n.created_at at time zone ${LAGOS})::date < ${day}
                 and ${day} >= n.unpaid_since + coalesce(n.grace_days_at_send, ${grace}) + 1) as final_sent_earlier
    from scope sc
    left join tenant_suspensions s on s.tenant_id = sc.tenant_id
    left join system_tenant_onboardings o on o.tenant_id = sc.tenant_id
    left join auth_organization_settings os on os.tenant_id = sc.tenant_id
    left join tenant_business_info bi on bi.tenant_id = sc.tenant_id
    left join lateral (
      select n.kind, n.sent_at as noticed_at from enforcement_notices n
      where n.tenant_id = sc.tenant_id and n.status = 'sent'
      order by n.sent_at desc nulls last limit 1
    ) ln on true
  )`;
}

function withStaged(graceDays: number, today: string, withStuckRestores: boolean): string {
  assertInputs(graceDays, today);
  return `with ${perTenantCte().trim()}${scopeCte(withStuckRestores)}${rowsCte(graceDays, today)}`;
}

function iso(value: unknown): string | null {
  if (!value) return null;
  return new Date(value as string | Date).toISOString();
}

function toRow(row: Row): EnforcementStagedRow {
  return {
    tenantId: String(row.tenant_id),
    tenantName: String(row.tenant_name),
    dueDate: String(row.due_date),
    graceEndsOn: String(row.grace_ends_on),
    stage: row.stage as EnforcementStage,
    owedKobo: Number(row.owed_kobo),
    items: Number(row.items),
    sources: (row.sources as EnforcementSourceKind[] | null) ?? [],
    suspendedAt: iso(row.suspended_at),
    suspensionCause: (row.cause as SuspensionCause | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    cascadeStatus: (row.cascade_status as string | null) ?? null,
    hasContact: Boolean(row.has_contact),
    lastNoticeKind: (row.last_notice_kind as string | null) ?? null,
    lastNoticeAt: iso(row.last_notice_at),
    waived: Boolean(row.waived),
    sentNoticeKeys: (row.sent_keys as string[] | null) ?? [],
    finalNoticeSentEarlier: Boolean(row.final_sent_earlier),
  };
}

function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function pageFilters(query: EnforcementPageQuery): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (query.stage !== 'all') {
    clauses.push(`stage = ?`);
    params.push(query.stage);
  }
  if (query.suspended !== undefined) {
    clauses.push(query.suspended ? `suspended_at is not null` : `suspended_at is null`);
  }
  const search = query.q?.trim();
  if (search) {
    clauses.push(`(tenant_name ilike ? or tenant_id ilike ?)`);
    params.push(likePattern(search), likePattern(search));
  }
  return { where: clauses.length ? `where ${clauses.join(' and ')}` : '', params };
}

@Injectable()
export class MikroEnforcementQueriesRepository implements EnforcementQueriesRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  private async run(sql: string, params: unknown[] = []): Promise<Row[]> {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork().getConnection().execute<Row[]>(sql, params);
  }

  async candidates(graceDays: number, today: string): Promise<EnforcementStagedRow[]> {
    const rows = await this.run(
      `${withStaged(graceDays, today, false)} select * from staged order by due_date, tenant_id`,
    );
    return rows.map(toRow);
  }

  async page(query: EnforcementPageQuery): Promise<{ rows: EnforcementStagedRow[]; total: number }> {
    const prefix = withStaged(query.graceDays, query.today, true);
    const { where, params } = pageFilters(query);
    const [counted, rows] = await Promise.all([
      this.run(`${prefix} select count(*) as total from staged ${where}`, params),
      this.run(
        `${prefix} select * from staged ${where} order by due_date, tenant_id limit ? offset ?`,
        [...params, query.pageSize, (query.page - 1) * query.pageSize],
      ),
    ]);
    return { rows: rows.map(toRow), total: Number(counted[0]?.total ?? 0) };
  }

  async summary(graceDays: number, today: string): Promise<EnforcementSummaryTotals> {
    const rows = await this.run(
      `${withStaged(graceDays, today, false)}
       select
         (select count(*) from staged where stage = 'in_grace') as in_grace,
         (select count(*) from staged where stage = 'past_grace') as past_grace,
         (select coalesce(sum(owed_kobo), 0) from staged) as owed_kobo,
         (select count(*) from tenant_suspensions where cause = 'non_payment') as suspended_non_payment,
         (select count(*) from tenant_suspensions where cause = 'manual') as suspended_manual`,
    );
    const row = rows[0] ?? {};
    return {
      inGrace: Number(row.in_grace ?? 0),
      pastGrace: Number(row.past_grace ?? 0),
      owedKobo: Number(row.owed_kobo ?? 0),
      suspendedNonPayment: Number(row.suspended_non_payment ?? 0),
      suspendedManual: Number(row.suspended_manual ?? 0),
    };
  }
}
