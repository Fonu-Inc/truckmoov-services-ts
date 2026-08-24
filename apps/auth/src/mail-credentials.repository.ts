export type MailServerSettings = {
  host: string;
  port: number;
  username: string;
  secure: boolean;
};

/** What is stored. Only the repository and the mail worker ever see ciphertext. */
export type StoredMailCredentials = {
  tenantId: string;
  emailAddress: string;
  displayName: string | null;
  imap: MailServerSettings & { passwordCiphertext: string; passwordPreview: string };
  smtp: MailServerSettings & { passwordCiphertext: string; passwordPreview: string };
  lastVerifiedAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

/**
 * What a screen may see. There is no ciphertext field on this type at all, so a
 * handler cannot return one by forgetting to strip it — the compiler refuses.
 */
export type MailCredentialsView = {
  tenantId: string;
  emailAddress: string;
  displayName: string | null;
  imap: MailServerSettings & { passwordPreview: string };
  smtp: MailServerSettings & { passwordPreview: string };
  lastVerifiedAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

export function toMailCredentialsView(stored: StoredMailCredentials): MailCredentialsView {
  return {
    tenantId: stored.tenantId,
    emailAddress: stored.emailAddress,
    displayName: stored.displayName,
    imap: {
      host: stored.imap.host,
      port: stored.imap.port,
      username: stored.imap.username,
      secure: stored.imap.secure,
      passwordPreview: stored.imap.passwordPreview,
    },
    smtp: {
      host: stored.smtp.host,
      port: stored.smtp.port,
      username: stored.smtp.username,
      secure: stored.smtp.secure,
      passwordPreview: stored.smtp.passwordPreview,
    },
    lastVerifiedAt: stored.lastVerifiedAt,
    lastError: stored.lastError,
    updatedAt: stored.updatedAt,
  };
}

export interface MailCredentialsRepository {
  findByTenant(tenantId: string): Promise<StoredMailCredentials | null>;
  save(credentials: StoredMailCredentials): Promise<void>;
  delete(tenantId: string): Promise<void>;
  recordVerification(tenantId: string, verifiedAt: Date | null, error: string | null): Promise<void>;
}

export const MAIL_CREDENTIALS_REPOSITORY = Symbol('MAIL_CREDENTIALS_REPOSITORY');
