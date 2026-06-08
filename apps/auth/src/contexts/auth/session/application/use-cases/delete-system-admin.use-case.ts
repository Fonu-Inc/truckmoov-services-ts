import { Inject, Injectable } from "@nestjs/common";
import { Role } from "@shared/rbac";
import { SESSION_STORE, type SessionStore } from "../../domain/ports/session-store.port";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";
import { resolveActorUser } from "./support/resolve-actor-user";

const SYSTEM_TENANT_ID = "system";

export type DeleteSystemAdminCommand = {
  accessToken: string;
  targetUserId: string;
};

@Injectable()
export class DeleteSystemAdminUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
  ) {}

  async execute(command: DeleteSystemAdminCommand) {
    const actor = await resolveActorUser(command.accessToken, this.tokenService, this.userRepo);
    if (actor.tenantId !== SYSTEM_TENANT_ID || actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenError("Only the super admin can delete admin accounts");
    }

    const target = await this.userRepo.findById(command.targetUserId);
    if (!target) {
      throw new UserNotFoundError();
    }
    if (target.tenantId !== SYSTEM_TENANT_ID || target.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenError("Only system admin accounts can be managed here");
    }
    if (target.id === actor.id) {
      throw new ForbiddenError("You cannot delete your own account");
    }

    await this.sessionStore.deleteAllForUser(target.id);
    await this.userRepo.deleteById(target.id);

    return {
      message: "Admin account deleted successfully",
      userId: target.id,
      email: target.email,
    };
  }
}
