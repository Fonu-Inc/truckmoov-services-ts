import { Inject, Injectable } from "@nestjs/common";
import { Role } from "@shared/rbac";
import { SESSION_STORE, type SessionStore, type UserSessionActivity } from "../../domain/ports/session-store.port";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";
import { USER_REPOSITORY, type StoredUser, type UserRepository } from "../../domain/ports/user-repository.port";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { resolveActorUser } from "./support/resolve-actor-user";

const SYSTEM_TENANT_ID = "system";

type SystemAdminView = {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
  accountStatus: "enabled" | "disabled";
  status: "active" | "inactive";
  lastActiveAt: string | null;
  profile: StoredUser["profile"];
};

@Injectable()
export class ListSystemAdminsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepo);
    if (actor.tenantId !== SYSTEM_TENANT_ID || actor.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenError("Only the super admin can view admin accounts");
    }

    const users = (await this.userRepo.findAllByTenant(SYSTEM_TENANT_ID))
      .filter((user) => user.role === Role.SYSTEM_ADMIN);
    const userActivity = await this.sessionStore.listUserActivity(users.map((user) => user.id));
    const userActivityById = new Map(userActivity.map((activity) => [activity.userId, activity] as const));

    return {
      tenantId: SYSTEM_TENANT_ID,
      users: users.map((user) => this.toView(user, userActivityById.get(user.id))),
    };
  }

  private toView(user: StoredUser, activity?: UserSessionActivity): SystemAdminView {
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      accountStatus: user.accountStatus ?? "enabled",
      status: activity?.hasActiveSession ? "active" : "inactive",
      lastActiveAt: activity?.lastActiveAt?.toISOString() ?? null,
      profile: user.profile,
    };
  }
}
