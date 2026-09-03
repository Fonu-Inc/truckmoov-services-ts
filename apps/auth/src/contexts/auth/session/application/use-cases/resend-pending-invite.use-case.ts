import { Inject, Injectable } from "@nestjs/common";
import { Role, hasPermission, Permission } from "@shared/rbac";
import { AUTH_NOTIFIER, type AuthNotifier } from "../../domain/ports/auth-notifier.port";
import { ID_GENERATOR, type IdGenerator } from "../../domain/ports/id-generator.port";
import { INVITE_REPOSITORY, type InviteRepository } from "../../domain/ports/invite-repository.port";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { InviteNotFoundError } from "../../domain/errors/invite-not-found.error";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { resolveActorUser } from "./support/resolve-actor-user";

export type ResendPendingInviteCommand = {
  accessToken: string;
  email: string;
};

@Injectable()
export class ResendPendingInviteUseCase {
  constructor(
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepo: InviteRepository,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(AUTH_NOTIFIER)
    private readonly notifier: AuthNotifier,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
  ) {}

  async execute(command: ResendPendingInviteCommand) {
    const actor = await resolveActorUser(
      command.accessToken,
      this.tokenService,
      this.userRepo,
    );

    if (!hasPermission(actor.role as Role, Permission.USER_INVITE)) {
      throw new ForbiddenError();
    }

    const email = command.email.trim();
    const invite = await this.inviteRepo.findPendingByEmailForTenant(
      actor.tenantId,
      email,
    );
    if (!invite) {
      throw new InviteNotFoundError();
    }

    const refreshedInvite = {
      ...invite,
      token: this.idGenerator.generate(),
      invitedBy: actor.id,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      createdAt: new Date(),
    };

    // Resend issues a fresh token so old links stop being the preferred entry path.
    await this.inviteRepo.save(refreshedInvite);

    await this.notifier.sendTenantInviteEmail({
      email: refreshedInvite.email,
      role: refreshedInvite.role,
      inviteToken: refreshedInvite.token,
    });

    return {
      message: "Invitation resent",
      email: refreshedInvite.email,
      role: refreshedInvite.role,
    };
  }
}
