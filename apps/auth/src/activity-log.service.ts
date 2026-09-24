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
import {
  SYSTEM_TENANT_LABEL,
  TENANT_NAME_READER,
  type TenantNameReader,
} from "./tenant-name-reader.port";
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

/** A person renames themselves more often than a tenant does. */
const ACTOR_NAME_TTL_MS = 60_000;

/** Written by jobs and listeners that act on no one's behalf. */
const SYSTEM_ACTOR_ID = "system";

type ActorSnapshot = { name: string | null; email: string | null };
const NO_ACTOR: ActorSnapshot = { name: null, email: null };

@Injectable()
export class ActivityLogService {
  private auditSetting: { enabled: boolean; expiresAt: number } | null = null;
  private readonly tenantNames = new Map<string, { name: string | null; expiresAt: number }>();
  private readonly actors = new Map<string, { snapshot: ActorSnapshot; expiresAt: number }>();

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

    if (!(await this.auditLoggingEnabled(command.action))) return entry;

    const named = await this.withNameSnapshots(entry);
    await this.repository.save(named);
    return named;
  }

  /**
   * Captured at write time rather than joined later: an audit row has to name
   * the actor and tenant as they were. Most writers (events from fleet and the
   * Go services, direct auth writes) only know the ids, so the names are
   * resolved here for every one of them.
   */
  private async withNameSnapshots(entry: ActivityLogEntry): Promise<ActivityLogEntry> {
    const needsActor = !entry.actorName || !entry.actorEmail;
    const [actor, tenantName] = await Promise.all([
      needsActor ? this.actorSnapshotFor(entry.actorId) : NO_ACTOR,
      entry.tenantName ?? this.tenantNameFor(entry.tenantId),
    ]);

    return {
      ...entry,
      actorName: entry.actorName ?? actor.name,
      actorEmail: entry.actorEmail ?? actor.email,
      tenantName,
    };
  }

  private async actorSnapshotFor(actorId: string | null): Promise<ActorSnapshot> {
    if (!actorId || actorId === SYSTEM_ACTOR_ID) return NO_ACTOR;

    const cached = this.actors.get(actorId);
    if (cached && cached.expiresAt > Date.now()) return cached.snapshot;

    try {
      const user = await this.userRepository.findById(actorId);
      const snapshot = { name: user?.profile?.fullName ?? null, email: user?.email ?? null };
      this.actors.set(actorId, { snapshot, expiresAt: Date.now() + ACTOR_NAME_TTL_MS });
      return snapshot;
    } catch {
      // A missing name must not stop the entry being written.
      return NO_ACTOR;
    }
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
      actorName: command.actorName ?? actor.profile?.fullName ?? null,
      actorEmail: command.actorEmail ?? actor.email,
    });
  }

  /**
   * The tenant's organisation name, cached briefly.
   *
   * Every audit write would otherwise be a second query, and a tenant is
   * renamed about as often as it is created.
   */
  private async tenantNameFor(tenantId: string): Promise<string | null> {
    if (tenantId === SYSTEM_TENANT_ID) return SYSTEM_TENANT_LABEL;

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
