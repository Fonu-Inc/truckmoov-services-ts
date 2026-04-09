import { Inject, Injectable } from "@nestjs/common";
import { Role } from "@shared/rbac";
import {
  TOKEN_SERVICE,
  type TokenService,
} from "../../domain/ports/token-service.port";
import {
  SESSION_STORE,
  type SessionStore,
} from "../../domain/ports/session-store.port";
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../domain/ports/user-repository.port";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";
import { resolveActorUser } from "./support/resolve-actor-user";

export type UpdateOrganizationUserStatusCommand = {
  accessToken: string;
  targetUserId: string;
  accountStatus: "enabled" | "disabled";
};

@Injectable()
export class UpdateOrganizationUserStatusUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
  ) {}

  async execute(command: UpdateOrganizationUserStatusCommand) {
    const actor = await resolveActorUser(
      command.accessToken,
      this.tokenService,
      this.userRepo,
    );

    if (actor.role !== Role.ENTERPRISE_ADMIN) {
      throw new ForbiddenError("Only enterprise admins can change account status");
    }

    const target = await this.userRepo.findById(command.targetUserId);
    if (!target) {
      throw new UserNotFoundError();
    }

    if (target.tenantId !== actor.tenantId) {
      throw new ForbiddenError("Cannot update users outside your tenant");
    }

    if (target.id === actor.id) {
      throw new ForbiddenError("You cannot change your own account status");
    }

    await this.userRepo.updateAccountStatus(target.id, command.accountStatus);
    if (command.accountStatus === "disabled") {
      await this.sessionStore.deleteAllForUser(target.id);
    }

    const [activity] = await this.sessionStore.listUserActivity([target.id]);

    return {
      message: `User account ${command.accountStatus} successfully`,
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
