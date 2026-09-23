import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../domain/entities/auth-user.entity';
import {
  IDENTITY_PROVIDER,
  type IdentityProvider,
} from '../../domain/ports/identity-provider.port';
import {
  SESSION_STORE,
  type SessionStore,
} from '../../domain/ports/session-store.port';
import {
  TOKEN_SERVICE,
  type TokenService,
} from '../../domain/ports/token-service.port';
import { isSystemRole } from '@shared/rbac';
import { isPlatformActor } from '@shared/identity';
import { ForbiddenError } from '../../domain/errors/forbidden.error';

export type LoginCommand = {
  email: string;
  password: string;
};

export type LoginAudience = 'tenant' | 'system';

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

    this.assertAudience(user, 'tenant');

    return this.issueSession(user);
  }

  async executeForAudience(command: LoginCommand, audience: LoginAudience) {
    const user = await this.identityProvider.verifyCredentials(
      command.email,
      command.password,
    );

    this.assertAudience(user, audience);

    return this.issueSession(user);
  }

  /**
   * Each login admits only its own people.
   *
   * The tenant login refuses every system role, including one held somewhere
   * it should not be. The system login requires a system role in the system
   * tenant: checking the role alone would let an account that was wrongly
   * given platform admin inside a tenant into the admin portal.
   */
  private assertAudience(user: AuthUser, audience: LoginAudience) {
    if (audience === 'tenant' && isSystemRole(user.role)) {
      throw new ForbiddenError(
        'System accounts must use the system login endpoint',
      );
    }
    if (audience === 'system' && !isPlatformActor(user)) {
      throw new ForbiddenError('This endpoint is reserved for system accounts');
    }
  }

  private async issueSession(user: AuthUser) {
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
