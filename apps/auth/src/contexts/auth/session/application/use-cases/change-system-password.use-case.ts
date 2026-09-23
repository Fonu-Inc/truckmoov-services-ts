import { Inject, Injectable } from "@nestjs/common";
import { Role } from "@shared/rbac";
import { AuthUser } from "../../domain/entities/auth-user.entity";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { InvalidCredentialsError } from "../../domain/errors/invalid-credentials.error";
import { PASSWORD_HASHER, type PasswordHasher } from "../../domain/ports/password-hasher.port";
import { SESSION_STORE, type SessionStore } from "../../domain/ports/session-store.port";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { resolveActorUser } from "./support/resolve-actor-user";
import { SYSTEM_TENANT_ID } from "@shared/identity";


export type ChangeSystemPasswordCommand = {
  accessToken: string;
  currentPassword: string;
  newPassword: string;
};

@Injectable()
export class ChangeSystemPasswordUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(command: ChangeSystemPasswordCommand) {
    const actor = await resolveActorUser(command.accessToken, this.tokenService, this.userRepo);
    if (actor.tenantId !== SYSTEM_TENANT_ID) {
      throw new ForbiddenError("This endpoint is reserved for system accounts");
    }
    if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.SYSTEM_ADMIN) {
      throw new ForbiddenError("This endpoint is reserved for system accounts");
    }

    const currentPasswordMatches = await this.passwordHasher.verify(
      command.currentPassword,
      actor.passwordHash,
    );
    if (!currentPasswordMatches) {
      throw new InvalidCredentialsError();
    }

    const passwordHash = await this.passwordHasher.hash(command.newPassword);
    await this.userRepo.updatePassword(actor.id, passwordHash);
    await this.sessionStore.deleteAllForUser(actor.id);

    const nextUser = AuthUser.create({
      id: actor.id,
      email: actor.email,
      role: actor.role,
      tenantId: actor.tenantId,
    });
    const accessToken = this.tokenService.issueAccessToken(nextUser);
    const refreshToken = this.tokenService.issueRefreshToken(nextUser);
    await this.sessionStore.save(refreshToken, nextUser);

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
      user: nextUser.toPrimitives(),
    };
  }
}
