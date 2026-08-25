import { Inject, Injectable, Logger } from '@nestjs/common';
import { SecretCipherService } from '@shared/crypto';
import { ObjectStorageService } from '@shared/object-storage';
import {
  MAIL_CREDENTIALS_REPOSITORY,
  type MailCredentialsRepository,
} from '../../mail-credentials.repository';
import { TOKEN_SERVICE, USER_REPOSITORY } from '../auth/session';
import { resolveActorUser } from '../auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from '../auth/session/domain/ports/token-service.port';
import type { UserRepository } from '../auth/session/domain/ports/user-repository.port';
import { MAILBOX_READER, type MailboxReader } from './mailbox-reader.port';
import { MAILBOX_REPOSITORY, type MailboxRepository } from './mailbox.repository';
import { StorageQuotaService } from '../../storage-quota.service';

export class AttachmentNotFoundError extends Error {
  constructor() {
    super('No such attachment');
  }
}

const DOWNLOAD_URL_TTL_SECONDS = 300;

/**
 * Hands back a link to one attachment.
 *
 * Bytes are not pulled during sync: fetching every attachment on every sync
 * moves a large amount of data for mail nobody opens. They are fetched the
 * first time one is asked for, then kept in object storage so a second request
 * does not go back to the tenant's mail server.
 */
@Injectable()
export class DownloadAttachmentUseCase {
  private readonly logger = new Logger(DownloadAttachmentUseCase.name);

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(MAIL_CREDENTIALS_REPOSITORY)
    private readonly credentials: MailCredentialsRepository,
    @Inject(MAILBOX_REPOSITORY) private readonly repository: MailboxRepository,
    @Inject(MAILBOX_READER) private readonly reader: MailboxReader,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
    @Inject(SecretCipherService) private readonly cipher: SecretCipherService,
    @Inject(StorageQuotaService) private readonly storageQuota: StorageQuotaService,
  ) {}

  async execute(accessToken: string, messageId: string, index: number) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);

    // Read through the tenant-scoped repository, so a caller cannot name
    // another organisation's message and be handed its attachment.
    const message = await this.repository.findByMessageId(actor.tenantId, messageId);
    const attachment = message?.attachments[index];
    if (!message || !attachment) throw new AttachmentNotFoundError();

    if (attachment.storageKey) {
      return this.linkTo(attachment.storageKey, attachment.filename);
    }

    const stored = await this.credentials.findByTenant(actor.tenantId);
    if (!stored) throw new AttachmentNotFoundError();

    const bytes = await this.reader.fetchAttachment({
      connection: {
        host: stored.imap.host,
        port: stored.imap.port,
        username: stored.imap.username,
        password: this.cipher.decrypt(stored.imap.passwordCiphertext),
        secure: stored.imap.secure,
      },
      folder: message.folder,
      uid: message.uid,
      index,
    });
    if (!bytes) throw new AttachmentNotFoundError();

    // Keyed by tenant, so one organisation's attachments can never collide with
    // another's however the mail servers number their messages.
    const key = `mailbox/${actor.tenantId}/${encodeURIComponent(messageId)}/${index}-${bytes.filename}`;
    await this.storage.putObject({
      key,
      body: bytes.content,
      contentType: bytes.contentType,
      visibility: 'private',
    });

    // Counted once, when the bytes first land in storage. A later download
    // serves the cached object and stores nothing new.
    await this.storageQuota.record(actor.tenantId, 'mailbox', bytes.content.byteLength);

    await this.repository.saveMessages([
      {
        ...message,
        attachments: message.attachments.map((existing, position) =>
          position === index ? { ...existing, storageKey: key } : existing,
        ),
      },
    ]);

    return this.linkTo(key, bytes.filename);
  }

  /** Presigned and short-lived: the object itself stays private. */
  private async linkTo(key: string, filename: string) {
    return {
      filename,
      url: await this.storage.createPresignedDownloadUrl({
        key,
        expiresIn: DOWNLOAD_URL_TTL_SECONDS,
      }),
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
    };
  }
}
