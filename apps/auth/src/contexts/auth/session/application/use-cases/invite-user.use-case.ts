import { Inject, Injectable } from "@nestjs/common";
import { Role, INVITABLE_ROLES, hasPermission, Permission } from "@shared/rbac";
import { AUTH_NOTIFIER, type AuthNotifier } from "@auth/session/domain/ports/auth-notifier.port";
import { ID_GENERATOR, type IdGenerator } from "@auth/session/domain/ports/id-generator.port";
import { INVITE_REPOSITORY, type InviteRepository } from "../../domain/ports/invite-repository.port";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { EmailTakenError } from "../../domain/errors/email-taken.error";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { InvalidAccessTokenError } from "../../domain/errors/invalid-access-token.error";

export type InviteUserCommand = {
  email: string;
  role: string;
  accessToken: string;
};

@Injectable()
export class InviteUserUseCase {
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

  async execute(command: InviteUserCommand) {
    const caller = this.tokenService.resolveAccessToken(command.accessToken);
    if (!caller) throw new InvalidAccessTokenError();

    const callerRole = caller.role as Role;
    if (!hasPermission(callerRole, Permission.USER_INVITE)) {
      throw new ForbiddenError();
    }

    const targetRole = command.role as Role;
    if (!(INVITABLE_ROLES as readonly string[]).includes(targetRole)) {
      throw new ForbiddenError("Cannot invite users with this role");
    }

    const email = command.email.trim();

    // Registration already refuses an email that has an account. Without the
    // same check here, one address ends up holding both a verification token
    // and an invite token, and only one of them works on any given endpoint.
    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser) throw new EmailTakenError();

    const existing = await this.inviteRepo.findPendingByEmailForTenant(
      caller.tenantId,
      email,
    );

    const token = this.idGenerator.generate();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    // Reuse an existing pending invite so re-inviting the same address refreshes
    // it in place instead of accumulating duplicate pending rows.
    await this.inviteRepo.save({
      id: existing?.id ?? this.idGenerator.generate(),
      email,
      role: targetRole,
      tenantId: caller.tenantId,
      token,
      invitedBy: caller.id,
      status: "pending",
      expiresAt,
      createdAt: new Date(),
    });

    await this.notifier.sendTenantInviteEmail({
      email,
      role: targetRole,
      inviteToken: token,
    });

    return { message: "Invitation sent", email, role: targetRole };
  }
}
