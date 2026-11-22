import { Inject, Injectable, Optional } from '@nestjs/common';
import { TenantOrganizationTypeReader } from '../../../../../tenant-organization-type.reader';
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
import { Role, isSystemRole } from '@shared/rbac';
import { isInstallerActor, isPlatformActor } from '@shared/identity';
import { ForbiddenError } from '../../domain/errors/forbidden.error';

export type LoginCommand = {
  email: string;
  password: string;
};

export type LoginAudience = 'tenant' | 'system' | 'installer';

const AUDIENCE_REFUSALS: Record<LoginAudience, string> = {
  tenant: 'System accounts must use the system login endpoint',
  system: 'This endpoint is reserved for system accounts',
  installer: 'This endpoint is reserved for installers',
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
    @Optional()
    @Inject(TenantOrganizationTypeReader)
    private readonly organizationTypes?: TenantOrganizationTypeReader,
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
    return this.issueSession(await this.verifyForAudience(command, audience));
  }

  /** Checks the password and the portal without opening a session yet. */
  async verifyForAudience(command: LoginCommand, audience: LoginAudience): Promise<AuthUser> {
    const user = await this.identityProvider.verifyCredentials(
      command.email,
      command.password,
    );
    this.assertAudience(user, audience);
    return user;
  }

  /**
   * Each login admits only its own people.
   *
   * The tenant login refuses every system role and installers, including
   * one held somewhere it should not be. The system and installer logins
   * each require their role in the system tenant: checking the role alone
   * would let an account that was wrongly given it inside a tenant through.
   */
  admits(user: AuthUser, audience: LoginAudience): boolean {
    if (audience === 'tenant') return !isSystemRole(user.role) && user.role !== Role.INSTALLER;
    if (audience === 'system') return isPlatformActor(user);
    return isInstallerActor(user);
  }

  private assertAudience(user: AuthUser, audience: LoginAudience) {
    if (!this.admits(user, audience)) throw new ForbiddenError(AUDIENCE_REFUSALS[audience]);
  }

  async issueSession(user: AuthUser) {
    const accessToken = this.tokenService.issueAccessToken(user);
    const refreshToken = this.tokenService.issueRefreshToken(user);

    await this.sessionStore.save(refreshToken, user);

    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
      user: { ...user.toPrimitives(), organizationType: (await this.organizationTypes?.of(user.tenantId)) ?? null },
    };
  }
}
