import { Inject, Injectable } from "@nestjs/common";
import { ID_GENERATOR, type IdGenerator } from "@auth/session/domain/ports/id-generator.port";
import { PASSWORD_HASHER, type PasswordHasher } from "@auth/session/domain/ports/password-hasher.port";
import { Role } from "@shared/rbac";
import { AuthUser } from "../../domain/entities/auth-user.entity";
import { EmailTakenError } from "../../domain/errors/email-taken.error";
import { InviteNotFoundError } from "../../domain/errors/invite-not-found.error";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { INVITE_REPOSITORY, type InviteRepository } from "../../domain/ports/invite-repository.port";
import { SESSION_STORE, type SessionStore } from "../../domain/ports/session-store.port";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";

export type RegisterInvitedCommand = {
  inviteToken: string;
  email: string;
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
  ) {}

  async execute(command: RegisterInvitedCommand) {
    const invite = await this.inviteRepo.findByToken(command.inviteToken);

    if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
      throw new InviteNotFoundError();
    }

    if (invite.role === Role.ENTERPRISE_ADMIN) {
      throw new ForbiddenError("Cannot register as Enterprise Admin via invitation");
    }

    const existing = await this.userRepo.findByEmail(command.email);
    if (existing) throw new EmailTakenError();

    const id = this.idGenerator.generate();
    const passwordHash = await this.passwordHasher.hash(command.password);
    const role = invite.role;

    await this.userRepo.save({
      id,
      email: command.email,
      passwordHash,
      role,
      tenantId: invite.tenantId,
      emailVerificationToken: null,
    });

    await this.inviteRepo.markAccepted(command.inviteToken);

    const user = AuthUser.create({
      id,
      email: command.email,
      role,
      tenantId: invite.tenantId,
    });

    const accessToken = this.tokenService.issueAccessToken(user);
    const refreshToken = this.tokenService.issueRefreshToken(user);

    await this.sessionStore.save(refreshToken, user);

    return { accessToken, refreshToken, expiresIn: 3600, user: user.toPrimitives() };
  }
}
