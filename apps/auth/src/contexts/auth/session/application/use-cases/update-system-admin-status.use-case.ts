import { Inject, Injectable } from "@nestjs/common";
import { Role } from "@shared/rbac";
import { SESSION_STORE, type SessionStore } from "../../domain/ports/session-store.port";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";
import { resolveActorUser } from "./support/resolve-actor-user";

const SYSTEM_TENANT_ID = "system";

export type UpdateSystemAdminStatusCommand = {
  accessToken: string;
  targetUserId: string;
  accountStatus: "enabled" | "disabled";
};

@Injectable()
export class UpdateSystemAdminStatusUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
  ) {}

  async execute(command: UpdateSystemAdminStatusCommand) {
    const actor = await resolveActorUser(command.accessToken, this.tokenService, this.userRepo);
    if (actor.tenantId !== SYSTEM_TENANT_ID || actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenError("Only the super admin can change admin account status");
    }

    const target = await this.userRepo.findById(command.targetUserId);
    if (!target) {
      throw new UserNotFoundError();
    }
    if (target.tenantId !== SYSTEM_TENANT_ID || target.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenError("Only system admin accounts can be managed here");
    }

    await this.userRepo.updateAccountStatus(target.id, command.accountStatus);
    if (command.accountStatus === "disabled") {
      await this.sessionStore.deleteAllForUser(target.id);
    }

    const [activity] = await this.sessionStore.listUserActivity([target.id]);

    return {
      message: `Admin account ${command.accountStatus} successfully`,
      user: {
        userId: target.id,
        email: target.email,
        role: target.role,
        tenantId: target.tenantId,
        accountStatus: command.accountStatus,
        status: activity?.hasActiveSession ? "active" : "inactive",
        lastActiveAt: activity?.lastActiveAt?.toISOString() ?? null,
        profile: target.profile,
      },
    };
  }
}
