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
import { ACTIVITY_LOG_REPOSITORY, type ActivityLogRepository } from "./activity-log.repository";
import type { ActivityLogEntry, ActivityLogMetadata, ActivityLogQuery } from "./activity-log.types";

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

@Injectable()
export class ActivityLogService {
  constructor(
    @Inject(ACTIVITY_LOG_REPOSITORY)
    private readonly repository: ActivityLogRepository,
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
    await this.repository.save(entry);
    return entry;
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
}
