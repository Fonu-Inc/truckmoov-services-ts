import { Inject, Injectable } from '@nestjs/common';
import {
  ACTIVITY_LOG_REPOSITORY,
  type ActivityLogRepository,
} from './activity-log.repository';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { FleetFactsService } from './fleet-facts.service';
import { SystemTenantNotFoundError } from './get-system-tenant.use-case';
import { ListSystemTenantsUseCase } from './list-system-tenants.use-case';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding';
import {
  PLAN_ENTITLEMENTS_REPOSITORY,
  type PlanEntitlementsRepository,
} from './plan-entitlements.repository';
import { UNLIMITED } from './plan-entitlements';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { ensureSystemActor } from './system-authz';

/** The Audit Log tab shows the ten most recent entries and nothing more. */
const TENANT_AUDIT_LIMIT = 10;

export const TENANT_RESOURCE_TABS = ['vehicles', 'drivers', 'devices', 'sims'] as const;
export type TenantResourceTab = (typeof TENANT_RESOURCE_TABS)[number];

export function isTenantResourceTab(value: string): value is TenantResourceTab {
  return (TENANT_RESOURCE_TABS as readonly string[]).includes(value);
}

/**
 * The resource tabs in the tenant drawer.
 *
 * Vehicles, drivers and devices belong to fleet and are fetched from it. SIMs
 * belong here. All four report the same shape so the drawer renders one
 * component four times.
 */
@Injectable()
export class GetTenantResourceUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
    @Inject(SIM_REPOSITORY) private readonly sims: SimRepository,
    @Inject(PLAN_ENTITLEMENTS_REPOSITORY)
    private readonly entitlements: PlanEntitlementsRepository,
    @Inject(ListSystemTenantsUseCase)
    private readonly tenants: ListSystemTenantsUseCase,
  ) {}

  async execute(accessToken: string, tenantId: string, tab: TenantResourceTab, planCode: string | null) {
    await ensureSystemActor(accessToken, this.tokenService, this.users, {
      forbiddenMessage: 'You are not permitted to view tenant detail',
    });

    // Without this a mistyped id answers exactly like a real tenant whose
    // fleet service is down, and the drawer cannot tell the two apart.
    const tenant = (await this.tenants.list(accessToken, {})).find((row) => row.id === tenantId);
    if (!tenant) throw new SystemTenantNotFoundError();

    // The caller should not have to know the tenant's plan to get its limit;
    // the query parameter stays as an override.
    const limit = planCode && planCode !== tenant.planCode
      ? await this.quotaFor(planCode, tab)
      : tenant.quotas[tab];
    const resource = tab === 'sims' ? await this.tenantSims(tenantId) : await this.fleet.tenantResource(tenantId, tab);

    if (!resource) {
      // Unreachable is not the same as empty, and a review screen must not
      // show a tenant as having no vehicles because a service was down.
      return {
        status: true,
        message: 'success',
        data: { available: false, total: 0, used: 0, limit, items: [] },
      };
    }

    return {
      status: true,
      message: 'success',
      data: {
        available: true,
        total: resource.total,
        used: resource.total,
        limit,
        items: resource.items,
      },
    };
  }

  private async tenantSims(tenantId: string) {
    const { items, total } = await this.sims.findAll({ tenantId });
    return {
      total,
      items: items.slice(0, 25).map((sim) => ({
        simId: sim.id,
        msisdn: sim.msisdn,
        carrier: sim.carrier,
        iccid: sim.iccid,
        status: sim.status,
        suspensionCause: sim.suspensionCause ?? null,
        suspensionReason: sim.suspensionReason,
      })),
    };
  }

  /** Null is unlimited, which a client must not render as a full bar. */
  private async quotaFor(planCode: string | null, tab: TenantResourceTab): Promise<number | null> {
    if (!planCode) return null;

    const entitlements = await this.entitlements.findByPlanCode(planCode).catch(() => null);
    const quota = entitlements?.quotas?.[tab];
    if (quota === undefined || quota === UNLIMITED) return null;
    return typeof quota === 'number' ? quota : null;
  }
}

/**
 * The Documents tab: what the tenant submitted at onboarding.
 *
 * Read from the onboarding application rather than a tenant document store,
 * because that is where they were uploaded and where they stayed — the
 * application's documents carry the tenant id once it is approved.
 */
@Injectable()
export class GetTenantDocumentsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
  ) {}

  async execute(accessToken: string, tenantId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.users, {
      forbiddenMessage: 'You are not permitted to view tenant documents',
    });

    const documents = await this.applications.findDocumentsByTenantId(tenantId);
    return {
      status: true,
      message: 'success',
      data: {
        total: documents.length,
        items: documents.map((document) => ({
          documentId: document.id,
          documentType: document.documentType,
          documentName: document.documentName,
          fileSize: document.fileSize,
          mimeType: document.mimeType,
          status: document.status,
          uploadedAt: document.createdAt.toISOString(),
        })),
      },
    };
  }
}

@Injectable()
export class GetTenantAuditLogUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ACTIVITY_LOG_REPOSITORY) private readonly activity: ActivityLogRepository,
  ) {}

  async execute(accessToken: string, tenantId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.users, {
      forbiddenMessage: 'You are not permitted to view tenant activity',
    });

    const entries = await this.activity.query(tenantId, { limit: TENANT_AUDIT_LIMIT });
    return {
      status: true,
      message: 'success',
      data: {
        total: entries.length,
        items: entries.map((entry) => ({
          id: entry.id,
          action: entry.action,
          summary: entry.summary,
          actorName: entry.actorName,
          actorEmail: entry.actorEmail,
          occurredAt: entry.occurredAt,
        })),
      },
    };
  }
}
