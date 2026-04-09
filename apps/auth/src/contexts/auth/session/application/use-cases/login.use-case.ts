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
import { Role } from '@shared/rbac';
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

    this.assertAudience(user.role, 'tenant');

    return this.issueSession(user);
  }

  async executeForAudience(command: LoginCommand, audience: LoginAudience) {
    const user = await this.identityProvider.verifyCredentials(
      command.email,
      command.password,
    );

    this.assertAudience(user.role, audience);

    return this.issueSession(user);
  }

  private assertAudience(role: string, audience: LoginAudience) {
    const isSuperAdmin = role === Role.SUPER_ADMIN;
    const isSystemAdmin = role === Role.SYSTEM_ADMIN;

    if (audience === 'tenant' && (isSuperAdmin || isSystemAdmin)) {
      throw new ForbiddenError(
        'System accounts must use the system login endpoint',
      );
    }
    if (audience === 'system' && !isSuperAdmin && !isSystemAdmin) {
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
