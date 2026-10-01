import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { roleToId } from '@shared/rbac';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type { NoticeKind } from '@auth/onboarding/domain/enforcement-stage';
import { TENANT_ADMIN_ROLES } from './enforcement-queries.repository';

export const MAX_NOTICE_ATTEMPTS = 3;

export type NoticeClaimInput = {
  tenantId: string;
  kind: NoticeKind;
  dedupKey: string;
  unpaidSince: string | null;
  recipients: string[];
  graceDaysAtSend?: number | null;
};

export type NoticeClaim = { id: string; attempts: number };

export type NoticeContacts = { customerName: string; emails: string[] };

export interface EnforcementNoticeRepository {
  /** Null when the key is already sent, in flight, or out of attempts. */
  claim(input: NoticeClaimInput): Promise<NoticeClaim | null>;
  markSent(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  contactsFor(tenantId: string): Promise<NoticeContacts>;
}

export const ENFORCEMENT_NOTICE_REPOSITORY = Symbol('ENFORCEMENT_NOTICE_REPOSITORY');

const EMAIL_PATTERN = /^\S+@\S+$/;

export function cleanEmails(values: unknown[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const email = typeof value === 'string' ? value.trim() : '';
    if (EMAIL_PATTERN.test(email)) seen.add(email.toLowerCase());
  }
  return [...seen];
}

type Row = Record<string, unknown>;

const STALE_PENDING = `interval '1 hour'`;

@Injectable()
export class MikroEnforcementNoticeRepository implements EnforcementNoticeRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async claim(input: NoticeClaimInput): Promise<NoticeClaim | null> {
    const rows = await this.run(
      `insert into enforcement_notices (tenant_id, kind, dedup_key, unpaid_since, recipients, status, attempts, grace_days_at_send)
       values (?, ?, ?, ?, cast(? as jsonb), 'pending', 1, ?)
       on conflict (dedup_key) do update set
         status = 'pending', attempts = enforcement_notices.attempts + 1, created_at = now(),
         last_error = null, recipients = excluded.recipients,
         grace_days_at_send = excluded.grace_days_at_send
       where enforcement_notices.attempts < ${MAX_NOTICE_ATTEMPTS}
         and (enforcement_notices.status = 'failed'
              or (enforcement_notices.status = 'pending'
                  and enforcement_notices.created_at < now() - ${STALE_PENDING}))
       returning id, attempts`,
      [input.tenantId, input.kind, input.dedupKey, input.unpaidSince, JSON.stringify(input.recipients), input.graceDaysAtSend ?? null],
    );
    const row = rows[0];
    return row ? { id: String(row.id), attempts: Number(row.attempts) } : null;
  }

  async markSent(id: string): Promise<void> {
    await this.run(
      `update enforcement_notices set status = 'sent', sent_at = now(), last_error = null where id = ?`,
      [id],
    );
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.run(
      `update enforcement_notices set status = 'failed', last_error = left(?, 500) where id = ?`,
      [error, id],
    );
  }

  async contactsFor(tenantId: string): Promise<NoticeContacts> {
    const roleIds = TENANT_ADMIN_ROLES.map((role) => roleToId(role)).join(', ');
    const [users, contact] = await Promise.all([
      this.run(`select email from auth_users where tenant_id = ? and role_id in (${roleIds})`, [tenantId]),
      this.run(
        `select coalesce(nullif(o.company->>'companyName', ''), nullif(os.branding->>'organizationName', ''),
                         nullif(bi.company_name, ''), ?) as name,
                o.company->>'billingEmail' as o_billing, o.company->>'email' as o_email,
                bi.billing_email as bi_billing, bi.email as bi_email
         from (select 1) one
         left join system_tenant_onboardings o on o.tenant_id = ?
         left join auth_organization_settings os on os.tenant_id = ?
         left join tenant_business_info bi on bi.tenant_id = ?`,
        [tenantId, tenantId, tenantId, tenantId],
      ),
    ]);
    const row = contact[0] ?? {};
    return {
      customerName: String(row.name ?? tenantId),
      emails: cleanEmails([
        ...users.map((user) => user.email),
        row.o_billing,
        row.o_email,
        row.bi_billing,
        row.bi_email,
      ]),
    };
  }

  private async run(sql: string, params: unknown[]): Promise<Row[]> {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork().getConnection().execute<Row[]>(sql, params);
  }
}
