import { Inject, Injectable } from "@nestjs/common";
import { ID_GENERATOR, type IdGenerator } from "@auth/session/domain/ports/id-generator.port";
import { PASSWORD_HASHER, type PasswordHasher } from "@auth/session/domain/ports/password-hasher.port";
import { Role } from "@shared/rbac";
import { holdsMisplacedSystemRole } from "@shared/identity";
import { AuthUser } from "../../domain/entities/auth-user.entity";
import { EmailTakenError } from "../../domain/errors/email-taken.error";
import { InviteNotFoundError } from "../../domain/errors/invite-not-found.error";
import { FullNameRequiredError } from "../../domain/errors/full-name-required.error";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { INVITE_REPOSITORY, type InviteRepository } from "../../domain/ports/invite-repository.port";
import { SESSION_STORE, type SessionStore } from "../../domain/ports/session-store.port";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";
import { INSTALLER_ACCOUNTS, type InstallerAccounts } from "../../domain/ports/installer-accounts.port";

export type RegisterInvitedCommand = {
  inviteToken: string;
  fullName?: string;
  email?: string;
  password: string;
};

@Injectable()
export class RegisterInvitedUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepo: InviteRepository,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
    @Inject(INSTALLER_ACCOUNTS)
    private readonly installers: InstallerAccounts,
  ) {}

  async execute(command: RegisterInvitedCommand) {
    const invite = await this.inviteRepo.findByToken(command.inviteToken);

    if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
      throw new InviteNotFoundError();
    }

    // ENTERPRISE_ADMIN is not refused here: tenants cannot invite it (see
    // INVITABLE_ROLES), and the system's own setup link for a new enterprise
    // tenant's first admin is exactly such an invite.
    // Re-checked here, not only when the invite was issued: invites created
    // before tenants lost the ability to grant system roles are still pending.
    if (holdsMisplacedSystemRole({ role: invite.role, tenantId: invite.tenantId })) {
      throw new ForbiddenError("This invitation cannot be accepted");
    }

    const existing = await this.userRepo.findByEmail(invite.email);
    if (existing) throw new EmailTakenError();

    const fullName = await this.fullNameFor(invite.role, invite.email, command.fullName);
    const id = this.idGenerator.generate();
    const passwordHash = await this.passwordHasher.hash(command.password);
    const role = invite.role;

    await this.userRepo.save({
      id,
      // The invite email is authoritative. Clients should not be able to swap
      // it during onboarding by posting a different value in the request body.
      email: invite.email,
      passwordHash,
      role,
      tenantId: invite.tenantId,
      emailVerificationToken: null,
      profile: {
        fullName,
        phoneNumber: null,
        address: null,
        profilePictureUrl: null,
      },
    });

    if (role === Role.INSTALLER) await this.installers.activate(invite.email, id);
    await this.inviteRepo.markAccepted(command.inviteToken);

    const user = AuthUser.create({
      id,
      email: invite.email,
      role,
      tenantId: invite.tenantId,
    });

    const accessToken = this.tokenService.issueAccessToken(user);
    const refreshToken = this.tokenService.issueRefreshToken(user);

    await this.sessionStore.save(refreshToken, user);

    return { accessToken, refreshToken, expiresIn: 3600, user: user.toPrimitives() };
  }

  /** An installer's name is the one on their installer record, which customers see. */
  private async fullNameFor(role: string, email: string, given?: string): Promise<string> {
    if (role !== Role.INSTALLER) {
      const name = given?.trim();
      if (!name) throw new FullNameRequiredError();
      return name;
    }
    const installer = await this.installers.invited(email);
    if (!installer) throw new InviteNotFoundError();
    return installer.fullName;
  }
}
