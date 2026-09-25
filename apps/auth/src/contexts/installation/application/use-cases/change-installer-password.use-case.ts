import { Inject, Injectable, Logger } from '@nestjs/common';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { Role } from '@shared/rbac';
import { ChangeSystemPasswordUseCase, TOKEN_SERVICE } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
  type StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import { ActivityLogService } from '../../../../activity-log.service';
import { currentInstaller } from './support/current-installer';

export type PasswordChange = { currentPassword: string; newPassword: string };

/**
 * Settings > Account & Security. The system accounts' change: same checks,
 * every session ended, a fresh pair of tokens back, and the change audited.
 */
@Injectable()
export class ChangeInstallerPasswordUseCase {
  private readonly logger = new Logger(ChangeInstallerPasswordUseCase.name);

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(ChangeSystemPasswordUseCase) private readonly passwords: ChangeSystemPasswordUseCase,
    @Inject(ActivityLogService) private readonly activity: ActivityLogService,
  ) {}

  async execute(accessToken: string, change: PasswordChange) {
    const installer = await currentInstaller({ tokens: this.tokens, installers: this.installers }, accessToken);
    const session = await this.passwords.execute({ accessToken, ...change }, [Role.INSTALLER]);
    await this.audit(installer, session.user.id);
    return session;
  }

  /** Best effort, like the system route: the password has already changed. */
  private async audit(installer: StoredInstaller, userId: string): Promise<void> {
    try {
      await this.activity.record({
        tenantId: SYSTEM_TENANT_ID,
        service: 'auth',
        action: 'installer.password.changed',
        entityType: 'user',
        entityId: userId,
        summary: 'Installer password changed',
        actorId: userId,
        actorRole: Role.INSTALLER,
        actorEmail: installer.email,
        metadata: { email: installer.email },
      });
    } catch (error) {
      this.logger.warn(`activity_log_record_failed:installer.password.changed:${(error as Error).message}`);
    }
  }
}
