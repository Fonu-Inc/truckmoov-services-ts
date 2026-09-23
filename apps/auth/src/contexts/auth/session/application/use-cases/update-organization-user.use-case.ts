import { Inject, Injectable } from "@nestjs/common";
import { Role, hasPermission, Permission } from "@shared/rbac";
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
  type UserProfile,
  type UserRepository,
} from "../../domain/ports/user-repository.port";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";
import { resolveActorUser } from "./support/resolve-actor-user";
import { SYSTEM_TENANT_ID } from "@shared/identity";


export type UpdateOrganizationUserCommand = {
  accessToken: string;
  targetUserId: string;
  fullName?: string;
  phoneNumber?: string;
  address?: string;
  profilePictureUrl?: string;
};

@Injectable()
export class UpdateOrganizationUserUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
  ) {}

  async execute(command: UpdateOrganizationUserCommand) {
    const actor = await resolveActorUser(
      command.accessToken,
      this.tokenService,
      this.userRepo,
    );

    if (!hasPermission(actor.role as Role, Permission.USER_UPDATE)) {
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
      throw new ForbiddenError("Cannot update users outside your tenant");
    }
    if (target.tenantId === SYSTEM_TENANT_ID) {
      throw new ForbiddenError("System accounts cannot be managed through tenant organization endpoints");
    }

    const mergedProfile: UserProfile = {
      fullName:
        command.fullName === undefined
          ? target.profile!.fullName
          : this.toNullableTrimmedString(command.fullName),
      phoneNumber:
        command.phoneNumber === undefined
          ? target.profile!.phoneNumber
          : this.toNullableTrimmedString(command.phoneNumber),
      address:
        command.address === undefined
          ? target.profile!.address
          : this.toNullableTrimmedString(command.address),
      profilePictureUrl:
        command.profilePictureUrl === undefined
          ? target.profile!.profilePictureUrl
          : this.toNullableTrimmedString(command.profilePictureUrl),
    };

    await this.userRepo.updateProfile(target.id, mergedProfile);
    const [activity] = await this.sessionStore.listUserActivity([target.id]);

    return {
      message: "User updated successfully",
      user: {
        userId: target.id,
        email: target.email,
        role: target.role,
        tenantId: target.tenantId,
        accountStatus: target.accountStatus ?? "enabled",
        status: activity?.hasActiveSession ? "active" : "inactive",
        lastActiveAt: activity?.lastActiveAt?.toISOString() ?? null,
        profile: mergedProfile,
      },
    };
  }

  private toNullableTrimmedString(value: string): string | null {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
}
