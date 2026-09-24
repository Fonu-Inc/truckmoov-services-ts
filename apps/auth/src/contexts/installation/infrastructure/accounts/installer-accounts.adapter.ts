import { Inject, Injectable } from '@nestjs/common';
import type {
  InstallerAccounts,
  InvitedInstaller,
} from '@auth/session/domain/ports/installer-accounts.port';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
} from '@auth/installation/domain/installer.repository';

@Injectable()
export class InstallerAccountsAdapter implements InstallerAccounts {
  constructor(
    @Inject(INSTALLER_REPOSITORY)
    private readonly installers: InstallerRepository,
  ) {}

  async invited(email: string): Promise<InvitedInstaller | null> {
    const installer = await this.installers.findByEmail(email);
    if (installer?.status !== 'invited' || installer.userId) return null;
    return { fullName: installer.fullName };
  }

  async activate(email: string, userId: string): Promise<void> {
    const installer = await this.installers.findByEmail(email);
    if (!installer) return;
    const now = new Date();
    await this.installers.save({
      ...installer,
      userId,
      status: 'active',
      lastActivityAt: now,
      updatedAt: now,
    });
  }
}
