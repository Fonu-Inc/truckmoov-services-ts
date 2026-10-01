import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { roleToId } from '@shared/rbac';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type { OnboardingApplicantType } from '@auth/onboarding/domain/onboarding-application.repository';
import type { RenewalFacts, RenewalFactsReader } from '@auth/onboarding/domain/licence-period.repository';
import { TENANT_ADMIN_ROLES } from '../../../../enforcement-queries.repository';

type Row = Record<string, unknown>;

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

@Injectable()
export class MikroRenewalFactsReader implements RenewalFactsReader {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async facts(tenantId: string, applicationId: string): Promise<RenewalFacts | null> {
    const orm = await getAuthOrm(this.config.db);
    const roleIds = TENANT_ADMIN_ROLES.map((role) => roleToId(role)).join(', ');
    const rows = await orm.em.fork().getConnection().execute<Row[]>(
      `select a.m2m_plan_code, a.organization_name, a.applicant_type, a.billing_email,
              (select count(*) from installation_device_assignments d
                 join installation_orders o on o.id = d.order_id
                where o.application_id = a.id and d.fleet_device_id is not null) as fleet_devices,
              exists (select 1 from auth_users u where u.tenant_id = ?) as has_user,
              (select u.email from auth_users u
                where u.tenant_id = ? and u.role_id in (${roleIds})
                order by u.created_at, u.id limit 1) as admin_email,
              exists (select 1 from tenant_terminations t where t.tenant_id = ?) as terminated
         from onboarding_applications a where a.id = ?`,
      [tenantId, tenantId, tenantId, applicationId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      applicationPlanCode: text(row.m2m_plan_code),
      customerName: text(row.organization_name) ?? tenantId,
      customerType: String(row.applicant_type) as OnboardingApplicantType,
      billingEmail: text(row.billing_email),
      adminEmail: text(row.admin_email),
      fleetDeviceCount: Number(row.fleet_devices ?? 0),
      hasUser: Boolean(row.has_user),
      terminated: Boolean(row.terminated),
    };
  }
}
