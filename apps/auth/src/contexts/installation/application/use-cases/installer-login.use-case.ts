import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError } from '@auth/session/domain/errors/forbidden.error';
import {
  LoginUseCase,
  type LoginCommand,
} from '@auth/session/application/use-cases/login.use-case';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
} from '@auth/installation/domain/installer.repository';

/**
 * Sign-in to the installer portal. The account must be an installer in the
 * system tenant, and the installer record behind it must be active: a
 * suspended installer is refused even while the account itself is enabled.
 */
@Injectable()
export class InstallerLoginUseCase {
  constructor(
    @Inject(LoginUseCase) private readonly login: LoginUseCase,
    @Inject(INSTALLER_REPOSITORY)
    private readonly installers: InstallerRepository,
  ) {}

  async execute(command: LoginCommand) {
    const user = await this.login.verifyForAudience(command, 'installer');
    const installer = await this.installers.findByUserId(user.id);
    if (installer?.status !== 'active') {
      throw new ForbiddenError('This endpoint is reserved for installers');
    }

    const session = await this.login.issueSession(user);
    const now = new Date();
    await this.installers.save({ ...installer, lastActivityAt: now, updatedAt: now });
    return session;
  }
}
