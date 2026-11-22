import { Inject, Injectable, Logger } from "@nestjs/common";
import { holdsMisplacedSystemRole } from "@shared/identity";
import { AuthUser } from "../../domain/entities/auth-user.entity";
import { EmailNotVerifiedError } from "../../domain/errors/email-not-verified.error";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { InvalidRefreshTokenError } from "../../domain/errors/invalid-refresh-token.error";
import { SessionExpiredError } from "../../domain/errors/session-expired.error";
import {
  SESSION_POLICY_READER,
  type SessionPolicyReader,
} from "../../domain/ports/session-policy.port";
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

export const REUSE_GRACE_MS = 10_000;

@Injectable()
export class RefreshUseCase {
  private readonly logger = new Logger(RefreshUseCase.name);

  constructor(
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(SESSION_POLICY_READER)
    private readonly policy: SessionPolicyReader,
  ) {}

  async execute(refreshToken: string) {
    const live = await this.sessionStore.getByRefreshToken(refreshToken);
    const user = live ?? (await this.spentWithinGrace(refreshToken));
    if (!user) throw new InvalidRefreshTokenError();

    await this.assertNotIdleTooLong(refreshToken);

    const storedUser = await this.userRepo.findById(user.id);
    if (!storedUser) {
      await this.sessionStore.deleteByRefreshToken(refreshToken);
      throw new InvalidRefreshTokenError();
    }
    if (storedUser.accountStatus === "disabled") {
      await this.sessionStore.deleteByRefreshToken(refreshToken);
      throw new ForbiddenError("This account has been disabled");
    }
    // Registration hands out a session before the address is verified. Without
    // this the holder renews it indefinitely and never has to open the email.
    if (storedUser.emailVerificationToken) {
      await this.sessionStore.deleteByRefreshToken(refreshToken);
      throw new EmailNotVerifiedError();
    }
    // Login already refuses these accounts; without this a session opened
    // before that change would keep renewing into platform-level tokens.
    if (holdsMisplacedSystemRole(storedUser)) {
      await this.sessionStore.deleteByRefreshToken(refreshToken);
      throw new ForbiddenError("This session can no longer be renewed");
    }

    // The account as it is now, not as it was at login: a role or tenant
    // change reaches the next token instead of waiting for a fresh sign-in.
    const current = AuthUser.create({
      id: storedUser.id,
      email: storedUser.email,
      role: storedUser.role,
      tenantId: storedUser.tenantId,
    });

    // Rotate on every use: the old refresh token is invalidated and a new
    // one issued, so a leaked/replayed token has a single-use window
    // instead of being valid indefinitely.
    const newRefreshToken = this.tokenService.issueRefreshToken(current);
    const continued =
      (live && (await this.sessionStore.rotate(refreshToken, newRefreshToken, current))) ||
      // Spent by a concurrent refresh (another tab, a retried request) moments ago.
      ((await this.spentWithinGrace(refreshToken)) && (await this.sessionStore.branch(refreshToken, newRefreshToken, current)));
    if (!continued) throw new InvalidRefreshTokenError();

    return {
      accessToken: this.tokenService.issueAccessToken(current),
      refreshToken: newRefreshToken,
      expiresIn: 3600,
    };
  }

  /**
   * The user of a spent token presented again within the grace window, so
   * tabs racing to refresh all stay signed in. Later than that, only someone
   * who kept a copy replays it, holder or thief, and there is no telling which:
   * the whole session ends and both have to sign in again.
   */
  private async spentWithinGrace(refreshToken: string): Promise<AuthUser | null> {
    const spent = await this.sessionStore.findSpent(refreshToken);
    if (!spent) return null;
    if (Date.now() - spent.spentAt.getTime() <= REUSE_GRACE_MS) return spent.user;
    await this.sessionStore.revokeFamily(refreshToken);
    this.logger.warn('refresh_token_reused: session revoked');
    throw new InvalidRefreshTokenError("refresh_reused");
  }

  /**
   * Enforces the idle timeout an administrator configured.
   *
   * Measured from the previous refresh, which is the last time this session
   * was used. The session is destroyed rather than merely refused, so a token
   * that has already timed out cannot be retried later.
   */
  private async assertNotIdleTooLong(refreshToken: string): Promise<void> {
    const timeoutMinutes = await this.policy.idleTimeoutMinutes();
    if (timeoutMinutes === null) return;

    const lastActiveAt = await this.sessionStore.lastActiveAt(refreshToken);
    if (!lastActiveAt) return;

    const idleMinutes = Math.floor((Date.now() - lastActiveAt.getTime()) / 60_000);
    if (idleMinutes < timeoutMinutes) return;

    await this.sessionStore.deleteByRefreshToken(refreshToken);
    throw new SessionExpiredError(idleMinutes);
  }
}
