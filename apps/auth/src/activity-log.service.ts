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

export type RecordActivityCommand = {
  tenantId: string;
  service: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  actorId?: string | null;
  actorRole?: string | null;
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
const SYSTEM_TENANT_ID = "system";

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

@Injectable()
export class ActivityLogService {
  private auditSetting: { enabled: boolean; expiresAt: number } | null = null;

  constructor(
    @Inject(ACTIVITY_LOG_REPOSITORY)
    private readonly repository: ActivityLogRepository,
    @Inject(SYSTEM_SETTINGS_REPOSITORY)
    private readonly systemSettings: SystemSettingsRepository,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async record(command: RecordActivityCommand): Promise<ActivityLogEntry> {
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
      metadata: { ...(command.metadata ?? {}) },
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
    });
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
