import { Inject, Injectable } from "@nestjs/common";
import { InvalidRefreshTokenError } from "../../domain/errors/invalid-refresh-token.error";
import {
  SESSION_STORE,
  type SessionStore,
} from "../../domain/ports/session-store.port";
import {
  TOKEN_SERVICE,
  type TokenService,
} from "../../domain/ports/token-service.port";

@Injectable()
export class RefreshUseCase {
  constructor(
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
  ) {}

  async execute(refreshToken: string) {
    const user = await this.sessionStore.getByRefreshToken(refreshToken);
    if (!user) {
      throw new InvalidRefreshTokenError();
    }

    return {
      accessToken: this.tokenService.issueAccessToken(user),
      refreshToken,
      expiresIn: 3600,
    };
  }
}
