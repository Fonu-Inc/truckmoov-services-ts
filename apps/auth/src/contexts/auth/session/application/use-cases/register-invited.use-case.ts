import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Role } from "@shared/rbac";
import { AuthUser } from "../../domain/entities/auth-user.entity";
import { UsernameTakenError } from "../../domain/errors/username-taken.error";
import { InviteNotFoundError } from "../../domain/errors/invite-not-found.error";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { INVITE_REPOSITORY, type InviteRepository } from "../../domain/ports/invite-repository.port";
import { SESSION_STORE, type SessionStore } from "../../domain/ports/session-store.port";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";
import { hashPassword } from "../../infrastructure/password";

export type RegisterInvitedCommand = {
  inviteToken: string;
  username: string;
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
  ) {}

  async execute(command: RegisterInvitedCommand) {
    const invite = await this.inviteRepo.findByToken(command.inviteToken);

    if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
      throw new InviteNotFoundError();
    }

    if (invite.role === Role.ENTERPRISE_ADMIN) {
      throw new ForbiddenError("Cannot register as Enterprise Admin via invitation");
    }

    const existing = await this.userRepo.findByUsername(command.username);
    if (existing) throw new UsernameTakenError();

    const id = randomUUID();
    const passwordHash = await hashPassword(command.password);
    const roles = [invite.role];

    await this.userRepo.save({
      id,
      username: command.username,
      passwordHash,
      roles,
      tenantId: invite.tenantId,
    });

    await this.inviteRepo.markAccepted(command.inviteToken);

    const user = AuthUser.create({
      id,
      username: command.username,
      roles,
      tenantId: invite.tenantId,
    });

    const accessToken = this.tokenService.issueAccessToken(user);
    const refreshToken = this.tokenService.issueRefreshToken(user);

    await this.sessionStore.save(refreshToken, user);

    return { accessToken, refreshToken, expiresIn: 3600, user: user.toPrimitives() };
  }
}
