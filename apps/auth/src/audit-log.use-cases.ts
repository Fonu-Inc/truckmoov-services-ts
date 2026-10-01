import { Inject, Injectable } from '@nestjs/common';
import {
  ACTIVITY_LOG_REPOSITORY,
  type ActivityLogRepository,
} from './activity-log.repository';
import type { ActivityLogEntry, AuditLogQuery } from './activity-log.types';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  SYSTEM_TENANT_LABEL,
  TENANT_NAME_READER,
  type TenantNameReader,
} from './tenant-name-reader.port';
import { SYSTEM_TENANT_ID } from '@shared/identity';

const DEFAULT_LIST_LIMIT = 100;
const LIST_MAX = 500;
const EXPORT_MAX = 5000;

/** Chains are verified per tenant, so a whole-platform check is many checks. */
const MAX_CHAINS_VERIFIED = 200;

export type AuditLogRow = {
  id: string;
  occurredAt: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  tenantId: string;
  tenantName: string | null;
  ipAddress: string | null;
  /** Which service recorded the entry. The Source column. */
  source: string;
  summary: string;
  reason: string | null;
};

@Injectable()
export class ListAuditLogUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(ACTIVITY_LOG_REPOSITORY) private readonly repository: ActivityLogRepository,
  ) {}

  async execute(accessToken: string, filters: AuditLogQuery) {
    await this.ensureViewer(accessToken);

    // Counted with the same filters but no limit, so the screen can say how
    // many rows the page is a slice of.
    const [entries, total] = await Promise.all([
      this.repository.queryAcrossTenants(withCappedLimit(filters, LIST_MAX)),
      this.repository.countAcrossTenants(filters),
    ]);
    return {
      status: true,
      message: 'success',
      data: { total, items: entries.map(toRow) },
    };
  }

  /** Same rows, no envelope, for the export to format. Capped higher than the list. */
  async rows(accessToken: string, filters: AuditLogQuery): Promise<AuditLogRow[]> {
    await this.ensureViewer(accessToken);

    const entries = await this.repository.queryAcrossTenants(withCappedLimit(filters, EXPORT_MAX));
    return entries.map(toRow);
  }

  private async ensureViewer(accessToken: string): Promise<void> {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view the platform audit log',
    });
  }
}

function withCappedLimit(filters: AuditLogQuery, max: number): AuditLogQuery {
  return { ...filters, limit: Math.min(filters.limit ?? DEFAULT_LIST_LIMIT, max) };
}

@Injectable()
export class GetAuditFilterOptionsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(ACTIVITY_LOG_REPOSITORY) private readonly repository: ActivityLogRepository,
    @Inject(TENANT_NAME_READER) private readonly tenantNames: TenantNameReader,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view the platform audit log',
    });

    const options = await this.repository.filterOptions();
    return {
      status: true,
      message: 'success',
      data: { ...options, tenants: await this.labelTenants(options.tenants) },
    };
  }

  /**
   * Audit rows only started carrying tenant_name when the column was added, so
   * every tenant whose rows predate it has nothing to show. The name is looked
   * up for those, which means a renamed tenant labels its old rows with its
   * current name — the alternative is a dropdown of bare UUIDs.
   */
  private async labelTenants(tenants: Array<{ tenantId: string; tenantName: string | null }>) {
    return Promise.all(
      tenants.map(async (tenant) => {
        if (tenant.tenantId === SYSTEM_TENANT_ID) {
          return { ...tenant, tenantName: SYSTEM_TENANT_LABEL };
        }
        if (tenant.tenantName) return tenant;
        return {
          ...tenant,
          tenantName: await this.tenantNames.organizationNameFor(tenant.tenantId),
        };
      }),
    );
  }
}

/**
 * Verifies every tenant's hash chain.
 *
 * The screen calls the trail immutable, and this is what makes that a claim
 * anyone can check rather than a label. Chains are per tenant, so the platform
 * answer is the aggregate: intact only when every one of them is.
 */
@Injectable()
export class VerifyAuditChainsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(ACTIVITY_LOG_REPOSITORY) private readonly repository: ActivityLogRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to verify the platform audit log',
    });

    const tenantIds = (await this.repository.listChainTenantIds()).slice(0, MAX_CHAINS_VERIFIED);
    const results = await Promise.all(
      tenantIds.map((tenantId) => this.repository.verifyChain(tenantId)),
    );

    const broken = results.filter((result) => !result.intact);
    return {
      status: true,
      message: 'success',
      data: {
        intact: broken.length === 0,
        chainsChecked: results.length,
        entriesChecked: results.reduce((total, result) => total + result.entriesChecked, 0),
        // Only the chains that failed. A list of every intact chain is noise on
        // a screen whose only question is whether anything was tampered with.
        brokenChains: broken.map((result) => ({
          tenantId: result.tenantId,
          entriesChecked: result.entriesChecked,
          firstBreak: result.firstBreak,
        })),
        verifiedAt: new Date().toISOString(),
      },
    };
  }
}

function toRow(entry: ActivityLogEntry): AuditLogRow {
  const ipAddress = entry.metadata?.['ipAddress'];
  const reason = entry.metadata?.['reason'];

  return {
    id: entry.id,
    occurredAt: entry.occurredAt,
    actorId: entry.actorId,
    actorName: entry.actorName,
    actorEmail: entry.actorEmail,
    actorRole: entry.actorRole,
    action: entry.action,
    resourceType: entry.entityType,
    resourceId: entry.entityId,
    tenantId: entry.tenantId,
    tenantName: entry.tenantName,
    // Recorded into metadata because the hash chain covers it there. Rows
    // written before capture existed carry none, and say so rather than guess.
    ipAddress: typeof ipAddress === 'string' ? ipAddress : null,
    source: entry.service,
    summary: entry.summary,
    reason: typeof reason === 'string' && reason.trim() ? reason : null,
  };
}
