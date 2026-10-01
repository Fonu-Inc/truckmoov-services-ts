import { Inject, Injectable } from "@nestjs/common";
import { Role } from "@shared/rbac";
import { resolveActorUser } from "./contexts/auth/session/application/use-cases/support/resolve-actor-user";
import { ForbiddenError } from "./contexts/auth/session/domain/errors/forbidden.error";
import { TOKEN_SERVICE, type TokenService } from "./contexts/auth/session/domain/ports/token-service.port";
import { USER_REPOSITORY, type StoredUser, type UserRepository } from "./contexts/auth/session/domain/ports/user-repository.port";
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from "./tenant-onboarding.repository";
import { GetSystemTenantUseCase, SystemTenantNotFoundError } from "./get-system-tenant.use-case";
import { SYSTEM_TENANT_ID } from "@shared/identity";
import { TenantSuspensionService, type Actor } from "./tenant-suspension.service";

const SYSTEM_MUTATOR_ROLES = new Set<string>([Role.SUPER_ADMIN, Role.SYSTEM_ADMIN]);

export class SystemTenantStatusConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class SystemTenantStatusReasonRequiredError extends Error {
  constructor() {
    super("A reason is required to suspend a tenant");
  }
}

export type UpdateSystemTenantStatusCommand = {
  accessToken: string;
  tenantId: string;
  status: "active" | "suspended";
  reason?: string;
};

@Injectable()
export class UpdateSystemTenantStatusUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly tenantOnboardingRepository: TenantOnboardingRepository,
    @Inject(GetSystemTenantUseCase)
    private readonly getSystemTenantUseCase: GetSystemTenantUseCase,
    @Inject(TenantSuspensionService)
    private readonly cascade: TenantSuspensionService,
  ) {}

  async execute(command: UpdateSystemTenantStatusCommand) {
    const actor = await resolveActorUser(command.accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId !== SYSTEM_TENANT_ID || !SYSTEM_MUTATOR_ROLES.has(actor.role)) {
      throw new ForbiddenError("Only system admins can change tenant status");
    }

    if (command.tenantId === SYSTEM_TENANT_ID) {
      throw new SystemTenantNotFoundError();
    }

    if (command.status !== "active" && !command.reason?.trim()) {
      throw new SystemTenantStatusReasonRequiredError();
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

    const assets = await this.applyStatus(command, actor);

    const detail = await this.getSystemTenantUseCase.execute(command.accessToken, command.tenantId);
    return {
      ...detail,
      message: command.status === "active"
        ? "Tenant reactivated successfully"
        : "Tenant suspended successfully",
      assets,
    };
  }

  private async applyStatus(
    command: UpdateSystemTenantStatusCommand,
    actor: StoredUser,
  ) {
    const staff: Actor = { id: actor.id, name: actor.profile?.fullName ?? actor.email, role: actor.role };
    const result = command.status === "active"
      ? await this.cascade.restore(command.tenantId, { cause: "manual", actor: staff })
      : await this.cascade.suspend(command.tenantId, {
          cause: "manual",
          reason: command.reason?.trim() ?? "",
          actor: staff,
        });
    if (result.busy) {
      throw new SystemTenantStatusConflictError("Another change for this customer is still running. Try again shortly.");
    }
    return { complete: result.status === "complete", counts: result.counts, error: result.error ?? null };
  }
}
