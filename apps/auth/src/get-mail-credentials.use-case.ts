import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  MAIL_CREDENTIALS_REPOSITORY,
  toMailCredentialsView,
  type MailCredentialsRepository,
  type MailCredentialsView,
} from './mail-credentials.repository';

@Injectable()
export class GetMailCredentialsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(MAIL_CREDENTIALS_REPOSITORY)
    private readonly repository: MailCredentialsRepository,
  ) {}

  /** Returns the view type, which has no ciphertext field to leak. */
  async execute(accessToken: string): Promise<MailCredentialsView | null> {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    const stored = await this.repository.findByTenant(actor.tenantId);
    return stored ? toMailCredentialsView(stored) : null;
  }
}
