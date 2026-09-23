import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Role } from "@shared/rbac";
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  ForbiddenError,
} from "./contexts/auth/session";
import { resolveActorUser } from "./contexts/auth/session/application/use-cases/support/resolve-actor-user";
import type { TokenService } from "./contexts/auth/session/domain/ports/token-service.port";
import type { UserRepository } from "./contexts/auth/session/domain/ports/user-repository.port";
import {
  ACTIVITY_LOG_REPOSITORY,
  type ActivityLogRepository,
  type ChainVerification,
} from "./activity-log.repository";
import type { ActivityLogEntry, ActivityLogMetadata, ActivityLogQuery } from "./activity-log.types";
import {
  SYSTEM_SETTINGS_REPOSITORY,
  type SystemSettingsRepository,
} from "./system-settings.repository";
import { TENANT_NAME_READER, type TenantNameReader } from "./tenant-name-reader.port";
import { currentRequestContext } from "./request-context";
import { SYSTEM_TENANT_ID } from "@shared/identity";

export type RecordActivityCommand = {
  tenantId: string;
  service: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  actorId?: string | null;
  actorRole?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  tenantName?: string | null;
  /**
   * The caller's address. Recorded into metadata, which the hash chain covers,
   * because unlike a name it cannot be re-derived from anything else.
   */
  ipAddress?: string | null;
  metadata?: ActivityLogMetadata;
  occurredAt?: string;
};

const VIEWER_ROLES = new Set<string>([
  Role.ENTERPRISE_ADMIN,
  Role.AGGREGATOR_ADMIN,
  Role.OWNER_OPERATOR,
  Role.PLATFORM_ADMIN,
  Role.FLEET_ADMIN,
  Role.OPERATIONS_MANAGER,
]);
const SYSTEM_VIEWER_ROLES = new Set<string>([
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
]);

/**
 * Actions written whatever the audit-logging setting says.
 *
 * Switching audit logging off is itself an administrative act. If that act
 * went unrecorded, the trail could be closed behind someone with no evidence
 * that it ever happened.
 */
const ALWAYS_LOGGED_ACTIONS = new Set<string>(["system.settings.updated"]);

/** Settings are read per write, so the answer is held briefly. */
const AUDIT_SETTING_TTL_MS = 10_000;

/** A tenant is renamed about as often as it is created. */
const TENANT_NAME_TTL_MS = 5 * 60_000;

@Injectable()
export class ActivityLogService {
  private auditSetting: { enabled: boolean; expiresAt: number } | null = null;
  private readonly tenantNames = new Map<string, { name: string | null; expiresAt: number }>();

  constructor(
    @Inject(ACTIVITY_LOG_REPOSITORY)
    private readonly repository: ActivityLogRepository,
    @Inject(SYSTEM_SETTINGS_REPOSITORY)
    private readonly systemSettings: SystemSettingsRepository,
    @Inject(TENANT_NAME_READER)
    private readonly tenantNameReader: TenantNameReader,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async record(command: RecordActivityCommand): Promise<ActivityLogEntry> {
    // Taken from the request the caller is already inside, so no controller
    // has to remember to pass it. Explicit wins where one is given.
    const ipAddress = command.ipAddress ?? currentRequestContext()?.ipAddress ?? null;
    const occurredAt = command.occurredAt?.trim() || new Date().toISOString();
    const recordedAt = new Date().toISOString();
    const entry: ActivityLogEntry = {
      id: randomUUID(),
      tenantId: command.tenantId,
      service: command.service,
      action: command.action,
      entityType: command.entityType,
      entityId: command.entityId,
      summary: command.summary,
      actorId: command.actorId ?? null,
      actorRole: command.actorRole ?? null,
      actorName: command.actorName ?? null,
      actorEmail: command.actorEmail ?? null,
      tenantName: command.tenantName ?? null,
      metadata: {
        ...(command.metadata ?? {}),
        ...(ipAddress ? { ipAddress } : {}),
      },
      occurredAt,
      recordedAt,
    };

    if (await this.auditLoggingEnabled(command.action)) {
      await this.repository.save(entry);
    }
    return entry;
  }

  /**
   * Whether this action should be written. Returns the entry to the caller
   * either way: a caller that reads the id back must not break because an
   * administrator turned logging off.
   */
  private async auditLoggingEnabled(action: string): Promise<boolean> {
    if (ALWAYS_LOGGED_ACTIONS.has(action)) return true;

    const now = Date.now();
    if (this.auditSetting && this.auditSetting.expiresAt > now) {
      return this.auditSetting.enabled;
    }

    try {
      const settings = await this.systemSettings.get();
      const enabled = settings?.security?.auditLogging ?? true;
      this.auditSetting = { enabled, expiresAt: now + AUDIT_SETTING_TTL_MS };
      return enabled;
    } catch {
      // Unreadable settings must not silence the trail.
      return true;
    }
  }

  async recordFromAccessToken(
    accessToken: string,
    command: Omit<RecordActivityCommand, "tenantId" | "actorId" | "actorRole">,
  ): Promise<ActivityLogEntry> {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    return this.record({
      ...command,
      tenantId: actor.tenantId,
      actorId: actor.id,
      actorRole: actor.role,
      // Captured now rather than joined later. An audit row has to name the
      // actor as they were, and a join returns the name they have today, or
      // nothing once the account is deleted.
      actorName: command.actorName ?? actor.profile?.fullName ?? null,
      actorEmail: command.actorEmail ?? actor.email,
      tenantName: command.tenantName ?? (await this.tenantNameFor(actor.tenantId)),
    });
  }

  /**
   * The tenant's organisation name, cached briefly.
   *
   * Every audit write would otherwise be a second query, and a tenant is
   * renamed about as often as it is created.
   */
  private async tenantNameFor(tenantId: string): Promise<string | null> {
    const cached = this.tenantNames.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.name;

    try {
      const name = await this.tenantNameReader.organizationNameFor(tenantId);
      this.tenantNames.set(tenantId, { name, expiresAt: Date.now() + TENANT_NAME_TTL_MS });
      return name;
    } catch {
      // A missing name must not stop the entry being written.
      return null;
    }
  }

  async queryForAccessToken(accessToken: string, filters: ActivityLogQuery): Promise<ActivityLogEntry[]> {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === SYSTEM_TENANT_ID) {
      throw new ForbiddenError("System accounts must use the system activity log endpoint");
    }
    if (!VIEWER_ROLES.has(actor.role)) {
      throw new ForbiddenError("You are not permitted to view activity logs");
    }
    return this.repository.query(actor.tenantId, filters);
  }

  async querySystemForAccessToken(
    accessToken: string,
    filters: ActivityLogQuery,
  ): Promise<ActivityLogEntry[]> {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId !== SYSTEM_TENANT_ID || !SYSTEM_VIEWER_ROLES.has(actor.role)) {
      throw new ForbiddenError("You are not permitted to view system activity logs");
    }
    return this.repository.query(SYSTEM_TENANT_ID, filters);
  }

  /**
   * Recomputes the caller's own chain. Scoped to the actor's tenant, never a
   * tenant they name, so this cannot be used to probe another tenant's log.
   * Restricted to the tenant's own admin: the answer says whether their records
   * were altered, which is not something every viewer role needs.
   */
  async verifyChainForAccessToken(accessToken: string): Promise<ChainVerification> {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === SYSTEM_TENANT_ID) {
      if (!SYSTEM_VIEWER_ROLES.has(actor.role)) {
        throw new ForbiddenError("You are not permitted to verify system activity logs");
      }
      return this.repository.verifyChain(SYSTEM_TENANT_ID);
    }
    if (actor.role !== Role.ENTERPRISE_ADMIN) {
      throw new ForbiddenError("You are not permitted to verify activity logs");
    }
    return this.repository.verifyChain(actor.tenantId);
  }
}
