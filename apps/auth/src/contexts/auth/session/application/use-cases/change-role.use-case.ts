import { Inject, Injectable } from "@nestjs/common";
import { Role, hasPermission, Permission } from "@shared/rbac";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";
import { SESSION_STORE, type SessionStore } from "../../domain/ports/session-store.port";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";

export type ChangeRoleCommand = {
  targetUserId: string;
  newRole: string;
  accessToken: string;
};

@Injectable()
export class ChangeRoleUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
  ) {}

  async execute(command: ChangeRoleCommand) {
    const caller = this.tokenService.resolveAccessToken(command.accessToken);
    if (!caller) throw new ForbiddenError();

    const callerRole = caller.roles[0] as Role;
    if (!hasPermission(callerRole, Permission.USER_ROLE_CHANGE)) {
      throw new ForbiddenError();
    }

    const target = await this.userRepo.findById(command.targetUserId);
    if (!target) throw new UserNotFoundError();

    if (target.tenantId !== caller.tenantId) {
      throw new ForbiddenError("Cannot change roles for users outside your tenant");
    }

    const newRole = command.newRole as Role;
    if (!Object.values(Role).includes(newRole)) {
      throw new ForbiddenError("Invalid role");
    }

    await this.userRepo.updateRoles(command.targetUserId, [newRole]);

    await this.sessionStore.deleteAllForUser(command.targetUserId);

    return {
      message: "Role updated successfully",
      userId: command.targetUserId,
      newRole,
    };
  }
}
