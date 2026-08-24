import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  TenantMailCredentialRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  MailCredentialsRepository,
  StoredMailCredentials,
} from './mail-credentials.repository';

function toStored(record: TenantMailCredentialRecord): StoredMailCredentials {
  return {
    tenantId: record.tenantId,
    emailAddress: record.emailAddress,
    displayName: record.displayName,
    imap: {
      host: record.imapHost,
      port: record.imapPort,
      username: record.imapUsername,
      secure: record.imapSecure,
      passwordCiphertext: record.imapPasswordCiphertext,
      passwordPreview: record.imapPasswordPreview,
    },
    smtp: {
      host: record.smtpHost,
      port: record.smtpPort,
      username: record.smtpUsername,
      secure: record.smtpSecure,
      passwordCiphertext: record.smtpPasswordCiphertext,
      passwordPreview: record.smtpPasswordPreview,
    },
    lastVerifiedAt: record.lastVerifiedAt?.toISOString() ?? null,
    lastError: record.lastError,
    updatedAt: record.updatedAt.toISOString(),
  };
}

@Injectable()
export class MikroMailCredentialsRepository implements MailCredentialsRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByTenant(tenantId: string): Promise<StoredMailCredentials | null> {
    const orm = await getAuthOrm(this.config.db);
    const record = await orm.em.fork().findOne(TenantMailCredentialRecord, { tenantId });
    return record ? toStored(record) : null;
  }

  async save(credentials: StoredMailCredentials): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.fork().upsert(TenantMailCredentialRecord, {
      tenantId: credentials.tenantId,
      emailAddress: credentials.emailAddress,
      displayName: credentials.displayName,
      imapHost: credentials.imap.host,
      imapPort: credentials.imap.port,
      imapUsername: credentials.imap.username,
      imapPasswordCiphertext: credentials.imap.passwordCiphertext,
      imapPasswordPreview: credentials.imap.passwordPreview,
      imapSecure: credentials.imap.secure,
      smtpHost: credentials.smtp.host,
      smtpPort: credentials.smtp.port,
      smtpUsername: credentials.smtp.username,
      smtpPasswordCiphertext: credentials.smtp.passwordCiphertext,
      smtpPasswordPreview: credentials.smtp.passwordPreview,
      smtpSecure: credentials.smtp.secure,
      lastVerifiedAt: credentials.lastVerifiedAt ? new Date(credentials.lastVerifiedAt) : null,
      lastError: credentials.lastError,
      updatedAt: new Date(),
    });
  }

  async delete(tenantId: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.fork().nativeDelete(TenantMailCredentialRecord, { tenantId });
  }

  async recordVerification(
    tenantId: string,
    verifiedAt: Date | null,
    error: string | null,
  ): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em
      .fork()
      .nativeUpdate(
        TenantMailCredentialRecord,
        { tenantId },
        { lastVerifiedAt: verifiedAt, lastError: error, updatedAt: new Date() },
      );
  }
}
