import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { MAX_QUOTA_OVERRIDE, QUOTA_REASON_MAX, QUOTA_REASON_MIN } from './dto/update-tenant-quotas.dto';
import { SystemTenantNotFoundError } from './get-system-tenant.use-case';
import { ListSystemTenantsUseCase } from './list-system-tenants.use-case';
import { ensureSystemActor } from './system-authz';
import {
  OVERRIDABLE_QUOTAS,
  TENANT_QUOTA_OVERRIDES_REPOSITORY,
  type QuotaOverrides,
  withQuotaOverrides,
  type TenantQuotaOverridesRepository,
} from './tenant-quota-overrides.repository';

export class InvalidTenantQuotasError extends Error {}

export type TenantQuotaChanges = Partial<Record<(typeof OVERRIDABLE_QUOTAS)[number], number | null>>;

export type UpdateTenantQuotasCommand = {
  accessToken: string;
  tenantId: string;
  changes: TenantQuotaChanges;
  reason: string;
};

function validReason(raw: string | undefined): string {
  const reason = raw?.trim() ?? '';
  if (reason.length < QUOTA_REASON_MIN || reason.length > QUOTA_REASON_MAX) {
    throw new InvalidTenantQuotasError(`reason must be ${QUOTA_REASON_MIN} to ${QUOTA_REASON_MAX} characters`);
  }
  return reason;
}

function validLimit(resource: string, value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > MAX_QUOTA_OVERRIDE) {
    throw new InvalidTenantQuotasError(`${resource} must be a whole number from 0 to ${MAX_QUOTA_OVERRIDE}, or null`);
  }
  return value;
}

function mergeChanges(before: QuotaOverrides, changes: TenantQuotaChanges): QuotaOverrides {
  const after = { ...before };
  let touched = false;
  for (const resource of OVERRIDABLE_QUOTAS) {
    const value = changes[resource];
    if (value === undefined) continue;
    after[resource] = validLimit(resource, value);
    touched = true;
  }
  if (!touched) throw new InvalidTenantQuotasError('Give at least one limit to change');
  return after;
}

@Injectable()
export class UpdateTenantQuotasUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ListSystemTenantsUseCase) private readonly tenants: ListSystemTenantsUseCase,
    @Inject(TENANT_QUOTA_OVERRIDES_REPOSITORY) private readonly overrides: TenantQuotaOverridesRepository,
  ) {}

  async execute(command: UpdateTenantQuotasCommand) {
    const actor = await ensureSystemActor(command.accessToken, this.tokenService, this.users, {
      forbiddenMessage: 'Only system admins can change tenant limits',
    });
    const reason = validReason(command.reason);

    const before = await this.overrides.findByTenant(command.tenantId);
    const after = mergeChanges(before, command.changes);

    const tenant = (await this.tenants.list(command.accessToken, {})).find((row) => row.id === command.tenantId);
    if (!tenant) throw new SystemTenantNotFoundError();

    await this.overrides.save(command.tenantId, after, actor.id);

    return {
      status: true,
      message: 'Tenant limits updated',
      data: {
        tenantId: command.tenantId,
        quotas: withQuotaOverrides(tenant.planQuotas, after),
        planQuotas: tenant.planQuotas,
        quotaOverrides: after,
      },
      audit: { before, after, reason },
    };
  }
}
