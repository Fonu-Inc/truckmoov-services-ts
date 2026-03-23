import { Inject, Injectable } from "@nestjs/common";
import { Role, hasPermission, Permission } from "@shared/rbac";
import {
  TOKEN_SERVICE,
  type TokenService,
} from "../../domain/ports/token-service.port";
import {
  SESSION_STORE,
  type SessionStore,
  type UserSessionActivity,
} from "../../domain/ports/session-store.port";
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
  status: "active" | "inactive";
  lastActiveAt: string | null;
  profile: StoredUser["profile"];
};

@Injectable()
export class ListOrganizationUsersUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
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
    // User rows do not carry activity state; auth session records are the
    // backend-owned source for whether someone is currently active and when
    // they were last seen by this service.
    const userActivity = await this.sessionStore.listUserActivity(
      users.map((user) => user.id),
    );
    const userActivityById = new Map(
      userActivity.map((activity) => [activity.userId, activity] as const),
    );

    return {
      tenantId: actor.tenantId,
      users: users.map((user) => this.toView(user, userActivityById.get(user.id))),
    };
  }

  private toView(
    user: StoredUser,
    activity?: UserSessionActivity,
  ): OrganizationUserView {
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      status: activity?.hasActiveSession ? "active" : "inactive",
      lastActiveAt: activity?.lastActiveAt?.toISOString() ?? null,
      profile: user.profile,
    };
  }
}
