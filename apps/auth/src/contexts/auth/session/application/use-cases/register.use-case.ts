import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Role } from "@shared/rbac";
import { AuthUser } from "../../domain/entities/auth-user.entity";
import { UsernameTakenError } from "../../domain/errors/username-taken.error";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { SESSION_STORE, type SessionStore } from "../../domain/ports/session-store.port";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";
import { hashPassword } from "../../infrastructure/password";

export type RegisterCommand = {
  username: string;
  password: string;
};

@Injectable()
export class RegisterUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
  ) {}

  async execute(command: RegisterCommand) {
    const existing = await this.userRepo.findByUsername(command.username);
    if (existing) throw new UsernameTakenError();

    const id = randomUUID();
    const tenantId = randomUUID();
    const passwordHash = await hashPassword(command.password);
    const roles = [Role.ENTERPRISE_ADMIN];

    await this.userRepo.save({ id, username: command.username, passwordHash, roles, tenantId });

    const user = AuthUser.create({ id, username: command.username, roles, tenantId });
    const accessToken = this.tokenService.issueAccessToken(user);
    const refreshToken = this.tokenService.issueRefreshToken(user);

    await this.sessionStore.save(refreshToken, user);

    return { accessToken, refreshToken, expiresIn: 3600, user: user.toPrimitives() };
  }
}
