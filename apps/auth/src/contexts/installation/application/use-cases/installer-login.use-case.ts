import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '@auth/session/domain/errors/forbidden.error';
import {
  LoginUseCase,
  type LoginCommand,
} from '@auth/session/application/use-cases/login.use-case';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
  type StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import {
  TwoFactorLogin,
  type CompletedLogin,
  type LoginStart,
} from '../../../../two-factor-login.use-case';

/**
 * Sign-in to the installer portal. The account must be an installer in the
 * system tenant, and the installer record behind it must be active: a
 * suspended installer is refused even while the account itself is enabled.
 * Checked again at the code step, since a suspension can land in between.
 */
@Injectable()
export class InstallerLoginUseCase {
  constructor(
    @Inject(LoginUseCase) private readonly login: LoginUseCase,
    @Inject(INSTALLER_REPOSITORY)
    private readonly installers: InstallerRepository,
    @Inject(TwoFactorLogin) private readonly twoFactor: TwoFactorLogin,
  ) {}

  async execute(command: LoginCommand): Promise<LoginStart> {
    const user = await this.login.verifyForAudience(command, 'installer');
    const installer = await this.activeInstaller(user.id);
    const started = await this.twoFactor.begin('installer', user);
    if (started.kind === 'session') await this.touch(installer);
    return started;
  }

  async completeTwoFactor(challengeToken: string, code: string): Promise<CompletedLogin> {
    const { user, secondFactor } = await this.twoFactor.verify('installer', challengeToken, code);
    const installer = await this.activeInstaller(user.id);
    const session = await this.login.issueSession(user);
    await this.touch(installer);
    return { session, secondFactor };
  }

  private async activeInstaller(userId: string): Promise<StoredInstaller> {
    const installer = await this.installers.findByUserId(userId);
    if (installer?.status !== 'active') {
      throw new ForbiddenError('This endpoint is reserved for installers');
    }
    return installer;
  }

  private async touch(installer: StoredInstaller): Promise<void> {
    const now = new Date();
    await this.installers.save({ ...installer, lastActivityAt: now, updatedAt: now });
  }
}
