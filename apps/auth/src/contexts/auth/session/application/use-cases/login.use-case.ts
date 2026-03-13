import { Inject, Injectable } from "@nestjs/common";
import {
  IDENTITY_PROVIDER,
  type IdentityProvider,
} from "../../domain/ports/identity-provider.port";
import {
  SESSION_STORE,
  type SessionStore,
} from "../../domain/ports/session-store.port";
import {
  TOKEN_SERVICE,
  type TokenService,
} from "../../domain/ports/token-service.port";

export type LoginCommand = {
  email: string;
  password: string;
};

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(IDENTITY_PROVIDER)
    private readonly identityProvider: IdentityProvider,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
  ) {}

  async execute(command: LoginCommand) {
    const user = await this.identityProvider.verifyCredentials(
      command.email,
      command.password,
    );

    const accessToken = this.tokenService.issueAccessToken(user);
    const refreshToken = this.tokenService.issueRefreshToken(user);

    await this.sessionStore.save(refreshToken, user);

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
      user: user.toPrimitives(),
    };
  }
}
