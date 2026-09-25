import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import {
  changedDisplayPreferences,
  changedWorkPreferences,
  displayPreferencesOf,
  workPreferencesOf,
  type InstallerDisplayPreferences,
  type InstallerWorkPreferences,
  type PreferenceChange,
} from '@auth/installation/domain/installer-preferences';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
  type StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import { currentInstaller } from './support/current-installer';

function workView(installer: StoredInstaller, preferences: InstallerWorkPreferences) {
  return { ...preferences, serviceAreas: installer.serviceAreas };
}

/** Settings > Display Preferences and Work Preferences. Service areas are shown, never set, here. */
@Injectable()
export class InstallerPreferencesUseCases {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
  ) {}

  async display(accessToken: string): Promise<InstallerDisplayPreferences> {
    return displayPreferencesOf((await this.installer(accessToken)).displayPreferences);
  }

  async updateDisplay(accessToken: string, change: PreferenceChange<InstallerDisplayPreferences>) {
    const installer = await this.installer(accessToken);
    const displayPreferences = changedDisplayPreferences(installer.displayPreferences, change);
    await this.installers.save({ ...installer, displayPreferences, updatedAt: new Date() });
    return displayPreferences;
  }

  async work(accessToken: string) {
    const installer = await this.installer(accessToken);
    return workView(installer, workPreferencesOf(installer.workPreferences));
  }

  async updateWork(accessToken: string, change: PreferenceChange<InstallerWorkPreferences>) {
    const installer = await this.installer(accessToken);
    const workPreferences = changedWorkPreferences(installer.workPreferences, change);
    await this.installers.save({ ...installer, workPreferences, updatedAt: new Date() });
    return workView(installer, workPreferences);
  }

  private installer(accessToken: string): Promise<StoredInstaller> {
    return currentInstaller({ tokens: this.tokens, installers: this.installers }, accessToken);
  }
}
