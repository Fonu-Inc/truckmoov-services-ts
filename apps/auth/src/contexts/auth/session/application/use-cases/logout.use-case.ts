import { Inject, Injectable } from "@nestjs/common";
import { SESSION_STORE, type SessionStore } from "../../domain/ports/session-store.port";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";

export type LogoutCommand = {
  refreshToken: string;
  accessToken?: string;
};

@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
  ) {}

  async execute(command: LogoutCommand) {
    const user = await this.sessionStore.getByRefreshToken(command.refreshToken);

    await this.sessionStore.deleteByRefreshToken(command.refreshToken);

    if (command.accessToken) {
      this.tokenService.revokeAccessToken?.(command.accessToken);
    }

    return { message: "Logged out successfully", userId: user?.id ?? null };
  }
}
