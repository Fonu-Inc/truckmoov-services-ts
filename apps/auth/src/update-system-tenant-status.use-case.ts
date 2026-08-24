import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Role } from "@shared/rbac";
import { resolveActorUser } from "./contexts/auth/session/application/use-cases/support/resolve-actor-user";
import { ForbiddenError } from "./contexts/auth/session/domain/errors/forbidden.error";
import { SESSION_STORE, type SessionStore } from "./contexts/auth/session/domain/ports/session-store.port";
import { TOKEN_SERVICE, type TokenService } from "./contexts/auth/session/domain/ports/token-service.port";
import { USER_REPOSITORY, type UserRepository } from "./contexts/auth/session/domain/ports/user-repository.port";
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from "./tenant-onboarding.repository";
import { GetSystemTenantUseCase, SystemTenantNotFoundError } from "./get-system-tenant.use-case";

const SYSTEM_TENANT_ID = "system";
const SYSTEM_MUTATOR_ROLES = new Set<string>([Role.SUPER_ADMIN, Role.SYSTEM_ADMIN]);

export class SystemTenantStatusConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type UpdateSystemTenantStatusCommand = {
  accessToken: string;
  tenantId: string;
  status: "active" | "suspended";
};

@Injectable()
export class UpdateSystemTenantStatusUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly tenantOnboardingRepository: TenantOnboardingRepository,
    @Inject(GetSystemTenantUseCase)
    private readonly getSystemTenantUseCase: GetSystemTenantUseCase,
    @Inject(EVENT_BUS)
    private readonly bus: EventBus,
  ) {}

  async execute(command: UpdateSystemTenantStatusCommand) {
    const actor = await resolveActorUser(command.accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId !== SYSTEM_TENANT_ID || !SYSTEM_MUTATOR_ROLES.has(actor.role)) {
      throw new ForbiddenError("Only system admins can change tenant status");
    }

    const users = await this.userRepository.findAllByTenant(command.tenantId);
    if (users.length === 0) {
      const onboarding = await this.tenantOnboardingRepository.findByTenantId(command.tenantId);
      if (onboarding) {
        throw new SystemTenantStatusConflictError(
          "Pending tenants cannot be status-managed until the bootstrap admin accepts the invite",
        );
      }
      throw new SystemTenantNotFoundError();
    }

    const nextAccountStatus = command.status === "active" ? "enabled" : "disabled";
    await Promise.all(users.map(async (user) => {
      await this.userRepository.updateAccountStatus(user.id, nextAccountStatus);
      if (nextAccountStatus === "disabled") {
        await this.sessionStore.deleteAllForUser(user.id);
      }
    }));

    // Other services verify the access token locally, so a token minted before
    // this moment stays valid to them until it expires. The event closes that
    // window; their cache TTL is the fallback for an event that never arrives.
    await this.announceStatusChange(command.tenantId, command.status, actor.id);

    const detail = await this.getSystemTenantUseCase.execute(command.accessToken, command.tenantId);
    return {
      ...detail,
      message: command.status === "active"
        ? "Tenant reactivated successfully"
        : "Tenant suspended successfully",
    };
  }

  // A failed announcement must not undo a suspension that is already written.
  // The status change is the authoritative act; this only speeds up its reach.
  private async announceStatusChange(
    tenantId: string,
    status: "active" | "suspended",
    actorId: string,
  ): Promise<void> {
    const type = status === "suspended" ? "tenant.suspended" : "tenant.reinstated";
    try {
      await this.bus.publish(`tm.${tenantId}.${type}`, {
        id: randomUUID(),
        type,
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: tenantId,
        actor: { id: actorId },
        data: { tenant_id: tenantId, status },
      });
    } catch {
      // Swallowed on purpose: see above.
    }
  }
}
