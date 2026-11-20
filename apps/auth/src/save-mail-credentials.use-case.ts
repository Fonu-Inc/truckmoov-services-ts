import { Inject, Injectable } from '@nestjs/common';
import { SecretCipherService } from '@shared/crypto';
import { isMailPort, isPubliclyRoutableHost } from '@shared/http';
import { isPlatformActor } from '@shared/identity';
import { Role } from '@shared/rbac';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  MAIL_CREDENTIALS_REPOSITORY,
  toMailCredentialsView,
  type MailCredentialsRepository,
  type MailCredentialsView,
} from './mail-credentials.repository';

export class UnsafeMailHostError extends Error {
  constructor(host: string) {
    super(`${host} is not a reachable public mail host`);
  }
}

export class UnsupportedMailPortError extends Error {
  constructor(port: number) {
    super(`${port} is not a mail port`);
  }
}

const MAIL_CONFIG_ROLES = new Set<string>([
  Role.ENTERPRISE_ADMIN,
  Role.OWNER_OPERATOR,
  Role.AGGREGATOR_ADMIN,
]);

export type SaveMailCredentialsCommand = {
  accessToken: string;
  emailAddress: string;
  displayName?: string | null;
  imap: { host: string; port: number; username: string; password: string; secure?: boolean };
  smtp: { host: string; port: number; username: string; password: string; secure?: boolean };
};

@Injectable()
export class SaveMailCredentialsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(MAIL_CREDENTIALS_REPOSITORY)
    private readonly repository: MailCredentialsRepository,
    @Inject(SecretCipherService) private readonly cipher: SecretCipherService,
  ) {}

  async execute(command: SaveMailCredentialsCommand): Promise<MailCredentialsView> {
    const actor = await resolveActorUser(command.accessToken, this.tokenService, this.userRepository);
    // The platform's own mailbox is configured by its staff, not a tenant role.
    if (!MAIL_CONFIG_ROLES.has(actor.role) && !isPlatformActor(actor)) {
      throw new ForbiddenError('You are not permitted to configure the mailbox');
    }

    // The tenant chooses a host this server will then connect to, which is the
    // same vector as a webhook URL: an internal admin port or the cloud
    // metadata endpoint reached from inside the cluster.
    this.assertReachable(command.imap.host, command.imap.port);
    this.assertReachable(command.smtp.host, command.smtp.port);

    const imapSecret = this.cipher.encrypt(command.imap.password);
    const smtpSecret = this.cipher.encrypt(command.smtp.password);

    await this.repository.save({
      tenantId: actor.tenantId,
      emailAddress: command.emailAddress.trim().toLowerCase(),
      displayName: command.displayName?.trim() || null,
      imap: {
        host: command.imap.host.trim().toLowerCase(),
        port: command.imap.port,
        username: command.imap.username.trim(),
        secure: command.imap.secure ?? true,
        passwordCiphertext: imapSecret.ciphertext,
        passwordPreview: imapSecret.preview,
      },
      smtp: {
        host: command.smtp.host.trim().toLowerCase(),
        port: command.smtp.port,
        username: command.smtp.username.trim(),
        secure: command.smtp.secure ?? true,
        passwordCiphertext: smtpSecret.ciphertext,
        passwordPreview: smtpSecret.preview,
      },
      // Saving a credential is not evidence it works. Verification is a
      // separate act, so a newly saved credential starts unverified.
      lastVerifiedAt: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
    });

    const stored = await this.repository.findByTenant(actor.tenantId);
    return toMailCredentialsView(stored!);
  }

  private assertReachable(host: string, port: number): void {
    if (!isPubliclyRoutableHost(host)) throw new UnsafeMailHostError(host);
    if (!isMailPort(port)) throw new UnsupportedMailPortError(port);
  }
}
