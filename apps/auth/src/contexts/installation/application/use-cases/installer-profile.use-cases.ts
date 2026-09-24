import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { TOKEN_SERVICE, USER_REPOSITORY } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import {
  normalizeStoredUser,
  type UserRepository,
} from '@auth/session/domain/ports/user-repository.port';
import type { UploadedDocumentFile } from '@auth/onboarding/domain/onboarding-document-file';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
  type StoredInstaller,
} from '@auth/installation/domain/installer.repository';
import { InvalidInstallerPhotoError, inspectInstallerPhoto } from '@auth/installation/domain/installer-photo';
import {
  INSTALLER_PHOTO_STORAGE,
  type InstallerPhotoStorage,
} from '@auth/installation/domain/ports/installer-photo-storage.port';
import { ActivityLogService } from '../../../../activity-log.service';
import { TICKET_FILE_SCANNER, scanRefusal, type TicketFileScanner } from '../../../../ticket-file-scanner.port';
import { currentInstaller } from './support/current-installer';
import {
  editedProfile,
  toProfileView,
  type ProfileInput,
} from './support/installer-profile.support';

/**
 * The installer's own Settings > Profile. Edits write the installer record,
 * which customers see, and the name follows onto the sign-in account.
 */
@Injectable()
export class InstallerProfileUseCases {
  private readonly logger = new Logger(InstallerProfileUseCases.name);
  private readonly scanRequired: boolean;

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(INSTALLER_PHOTO_STORAGE) private readonly photos: InstallerPhotoStorage,
    @Inject(TICKET_FILE_SCANNER) private readonly scanner: TicketFileScanner,
    @Inject(ActivityLogService) private readonly activity: ActivityLogService,
    @Inject(AppConfigService) config: AppConfigService,
  ) {
    this.scanRequired = config.fleet.documentScanRequired;
  }

  async get(accessToken: string) {
    return this.view(await this.installer(accessToken));
  }

  async update(accessToken: string, input: ProfileInput) {
    const current = await this.installer(accessToken);
    const updated = { ...editedProfile(current, input), updatedAt: new Date() };
    await this.installers.save(updated);
    await this.syncAccountName(updated);
    await this.audit(updated, Object.keys(input).filter((key) => input[key as keyof ProfileInput] !== undefined));
    return this.view(updated);
  }

  async uploadPhoto(accessToken: string, file?: UploadedDocumentFile) {
    const installer = await this.installer(accessToken);
    const photo = inspectInstallerPhoto(file);
    await this.scan(photo);

    const photoKey = await this.photos.store(installer.id, photo);
    const updated = { ...installer, photoKey, updatedAt: new Date() };
    await this.installers.save(updated);
    if (installer.photoKey) await this.removeQuietly(installer.photoKey);
    return this.view(updated);
  }

  private installer(accessToken: string): Promise<StoredInstaller> {
    return currentInstaller({ tokens: this.tokens, installers: this.installers }, accessToken);
  }

  private async view(installer: StoredInstaller) {
    return toProfileView(installer, await this.photos.url(installer.photoKey));
  }

  private async scan(photo: { filename: string; mimeType: string; buffer: Buffer }): Promise<void> {
    const verdict = await this.scanner.scan(photo.filename, photo.mimeType, photo.buffer);
    const refusal = scanRefusal(verdict, this.scanRequired);
    if (refusal) throw new InvalidInstallerPhotoError(`Photo rejected: ${refusal}`);
  }

  private async removeQuietly(key: string): Promise<void> {
    try {
      await this.photos.remove(key);
    } catch (error) {
      this.logger.warn(`installer_photo_delete_failed:${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  private async syncAccountName(installer: StoredInstaller): Promise<void> {
    if (!installer.userId) return;
    const user = await this.users.findById(installer.userId);
    if (!user) return;
    const { profile } = normalizeStoredUser(user);
    if (profile) await this.users.updateProfile(installer.userId, { ...profile, fullName: installer.fullName });
  }

  private async audit(installer: StoredInstaller, fields: string[]): Promise<void> {
    await this.activity.record({
      tenantId: SYSTEM_TENANT_ID,
      service: 'auth',
      action: 'installer.profile.updated',
      entityType: 'installer',
      entityId: installer.id,
      summary: `Installer profile updated: ${installer.code}`,
      actorId: installer.userId,
      actorRole: 'INSTALLER',
      actorEmail: installer.email,
      metadata: { fields },
    });
  }
}
