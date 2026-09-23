import { Inject, Injectable } from "@nestjs/common";
import { Role, hasPermission, Permission } from "@shared/rbac";
import { SESSION_STORE, type SessionStore } from "../../domain/ports/session-store.port";
import {
  TOKEN_SERVICE,
  type TokenService,
} from "../../domain/ports/token-service.port";
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../domain/ports/user-repository.port";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";
import { resolveActorUser } from "./support/resolve-actor-user";
import { SYSTEM_TENANT_ID } from "@shared/identity";


export type RemoveOrganizationUserCommand = {
  accessToken: string;
  targetUserId: string;
};

@Injectable()
export class RemoveOrganizationUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
  ) {}

  async execute(command: RemoveOrganizationUserCommand) {
    const actor = await resolveActorUser(
      command.accessToken,
      this.tokenService,
      this.userRepo,
    );

    if (!hasPermission(actor.role as Role, Permission.USER_DELETE)) {
      throw new ForbiddenError();
    }
    if (actor.tenantId === SYSTEM_TENANT_ID) {
      throw new ForbiddenError("System accounts must use the system admin endpoints");
    }

    const target = await this.userRepo.findById(command.targetUserId);
    if (!target) {
      throw new UserNotFoundError();
    }

    if (target.tenantId !== actor.tenantId) {
      throw new ForbiddenError("Cannot remove users outside your tenant");
    }
    if (target.tenantId === SYSTEM_TENANT_ID) {
      throw new ForbiddenError("System accounts cannot be managed through tenant organization endpoints");
    }

    if (target.id === actor.id) {
      throw new ForbiddenError("You cannot remove your own account from the organization");
    }

    await this.sessionStore.deleteAllForUser(target.id);
    await this.userRepo.deleteById(target.id);

    return {
      message: "User removed from organization",
      userId: target.id,
      email: target.email,
    };
  }
}
