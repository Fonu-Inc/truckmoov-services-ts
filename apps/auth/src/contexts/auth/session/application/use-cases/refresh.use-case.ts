import { Inject, Injectable } from "@nestjs/common";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { InvalidRefreshTokenError } from "../../domain/errors/invalid-refresh-token.error";
import {
  SESSION_STORE,
  type SessionStore,
} from "../../domain/ports/session-store.port";
import {
  TOKEN_SERVICE,
  type TokenService,
} from "../../domain/ports/token-service.port";
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../domain/ports/user-repository.port";

@Injectable()
export class RefreshUseCase {
  constructor(
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
  ) {}

  async execute(refreshToken: string) {
    const user = await this.sessionStore.getByRefreshToken(refreshToken);
    if (!user) {
      throw new InvalidRefreshTokenError();
    }

    const storedUser = await this.userRepo.findById(user.id);
    if (!storedUser) {
      await this.sessionStore.deleteByRefreshToken(refreshToken);
      throw new InvalidRefreshTokenError();
    }
    if (storedUser.accountStatus === "disabled") {
      await this.sessionStore.deleteByRefreshToken(refreshToken);
      throw new ForbiddenError("This account has been disabled");
    }

    // Rotate on every use: the old refresh token is invalidated and a new
    // one issued, so a leaked/replayed token has a single-use window
    // instead of being valid indefinitely.
    await this.sessionStore.deleteByRefreshToken(refreshToken);
    const newRefreshToken = this.tokenService.issueRefreshToken(user);
    await this.sessionStore.save(newRefreshToken, user);

    return {
      accessToken: this.tokenService.issueAccessToken(user),
      refreshToken: newRefreshToken,
      expiresIn: 3600,
    };
  }
}
