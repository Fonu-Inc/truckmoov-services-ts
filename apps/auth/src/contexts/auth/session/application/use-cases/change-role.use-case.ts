import { Inject, Injectable } from "@nestjs/common";
import { Role, hasPermission, Permission } from "@shared/rbac";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";
import { SESSION_STORE, type SessionStore } from "../../domain/ports/session-store.port";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { InvalidAccessTokenError } from "../../domain/errors/invalid-access-token.error";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";

const SYSTEM_TENANT_ID = "system";

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
    if (!caller) throw new InvalidAccessTokenError();

    const callerRole = caller.role as Role;
    if (!hasPermission(callerRole, Permission.USER_ROLE_CHANGE)) {
      throw new ForbiddenError();
    }
    if (caller.tenantId === SYSTEM_TENANT_ID) {
      throw new ForbiddenError("System accounts must use the system admin endpoints");
    }

    const target = await this.userRepo.findById(command.targetUserId);
    if (!target) throw new UserNotFoundError();

    if (target.tenantId !== caller.tenantId) {
      throw new ForbiddenError("Cannot change roles for users outside your tenant");
    }
    if (target.tenantId === SYSTEM_TENANT_ID) {
      throw new ForbiddenError("System accounts cannot be managed through tenant organization endpoints");
    }

    const newRole = command.newRole as Role;
    if (!Object.values(Role).includes(newRole)) {
      throw new ForbiddenError("Invalid role");
    }
    if (newRole === Role.SUPER_ADMIN || newRole === Role.SYSTEM_ADMIN) {
      throw new ForbiddenError("Cannot assign system roles through tenant organization endpoints");
    }

    await this.userRepo.updateRole(command.targetUserId, newRole);

    await this.sessionStore.deleteAllForUser(command.targetUserId);

    return {
      message: "Role updated successfully",
      userId: command.targetUserId,
      newRole,
    };
  }
}
