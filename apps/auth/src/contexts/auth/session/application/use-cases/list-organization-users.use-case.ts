import { Inject, Injectable } from "@nestjs/common";
import { Role, hasPermission, Permission } from "@shared/rbac";
import {
  TOKEN_SERVICE,
  type TokenService,
} from "../../domain/ports/token-service.port";
import {
  USER_REPOSITORY,
  type StoredUser,
  type UserRepository,
} from "../../domain/ports/user-repository.port";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { resolveActorUser } from "./support/resolve-actor-user";

type OrganizationUserView = {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
  profile: StoredUser["profile"];
};

@Injectable()
export class ListOrganizationUsersUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepo,
    );

    if (!hasPermission(actor.role as Role, Permission.USER_READ)) {
      throw new ForbiddenError();
    }

    const users = await this.userRepo.findAllByTenant(actor.tenantId);
    return {
      tenantId: actor.tenantId,
      users: users.map((user) => this.toView(user)),
    };
  }

  private toView(user: StoredUser): OrganizationUserView {
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      profile: user.profile,
    };
  }
}
