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
import {
  INVITE_REPOSITORY,
  type InviteRepository,
  type StoredInvite,
} from "../../domain/ports/invite-repository.port";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { resolveActorUser } from "./support/resolve-actor-user";

const SYSTEM_TENANT_ID = "system";

export type OrgUserFilters = {
  search?: string;
  role?: string;
  status?: string;
};

type OrganizationUserView = {
  userId: string | null;
  email: string;
  role: string;
  tenantId: string;
  accountStatus: "enabled" | "disabled" | null;
  status: "active" | "inactive" | "invited";
  lastActiveAt: string | null;
  profile: StoredUser["profile"] | null;
  inviteStatus: "accepted" | "invited";
  invitedAt?: string;
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
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepo: InviteRepository,
  ) {}

  async execute(accessToken: string, filters: OrgUserFilters = {}) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepo);

    if (!hasPermission(actor.role as Role, Permission.USER_READ)) {
      throw new ForbiddenError();
    }
    if (actor.tenantId === SYSTEM_TENANT_ID) {
      throw new ForbiddenError("System accounts must use the system admin endpoints");
    }

    const { search, role, status } = filters;

    const [users, pendingInvites] = await Promise.all([
      status === "invited"
        ? Promise.resolve([])
        : this.userRepo.findAllByTenantFiltered(actor.tenantId, {
            search,
            role,
            accountStatus: status === "active" || status === "inactive" ? undefined : undefined,
          }),
      status === "active" || status === "inactive"
        ? Promise.resolve([])
        : this.inviteRepo.listPendingByTenant(actor.tenantId),
    ]);

    const userActivity = await this.sessionStore.listUserActivity(users.map((u) => u.id));
    const activityById = new Map(userActivity.map((a) => [a.userId, a] as const));

    const userViews: OrganizationUserView[] = users
      .filter((u) => {
        if (!status || status === "invited") return true;
        const active = activityById.get(u.id)?.hasActiveSession ?? false;
        return status === "active" ? active : !active;
      })
      .map((u) => this.toUserView(u, activityById.get(u.id)));

    const inviteViews: OrganizationUserView[] = this.filterInvites(pendingInvites, { search, role });

    return {
      tenantId: actor.tenantId,
      users: [...userViews, ...inviteViews],
    };
  }

  private filterInvites(
    invites: StoredInvite[],
    filters: { search?: string; role?: string },
  ): OrganizationUserView[] {
    return invites
      .filter((inv) => {
        if (filters.role && inv.role !== filters.role) return false;
        if (filters.search) {
          const q = filters.search.toLowerCase();
          if (!inv.email.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .map((inv) => ({
        userId: null,
        email: inv.email,
        role: inv.role,
        tenantId: inv.tenantId,
        accountStatus: null,
        status: "invited" as const,
        lastActiveAt: null,
        profile: null,
        inviteStatus: "invited" as const,
        invitedAt: inv.createdAt.toISOString(),
      }));
  }

  private toUserView(
    user: StoredUser,
    activity?: UserSessionActivity,
  ): OrganizationUserView {
    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      accountStatus: user.accountStatus ?? "enabled",
      status: activity?.hasActiveSession ? "active" : "inactive",
      lastActiveAt: activity?.lastActiveAt?.toISOString() ?? null,
      profile: user.profile ?? null,
      inviteStatus: "accepted",
    };
  }
}
