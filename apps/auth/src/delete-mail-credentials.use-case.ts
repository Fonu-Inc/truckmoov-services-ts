import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@shared/rbac';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  MAIL_CREDENTIALS_REPOSITORY,
  type MailCredentialsRepository,
} from './mail-credentials.repository';

const MAIL_CONFIG_ROLES = new Set<string>([
  Role.ENTERPRISE_ADMIN,
  Role.OWNER_OPERATOR,
  Role.AGGREGATOR_ADMIN,
]);

@Injectable()
export class DeleteMailCredentialsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(MAIL_CREDENTIALS_REPOSITORY)
    private readonly repository: MailCredentialsRepository,
  ) {}

  async execute(accessToken: string): Promise<{ message: string }> {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (!MAIL_CONFIG_ROLES.has(actor.role)) {
      throw new ForbiddenError('You are not permitted to configure the mailbox');
    }

    await this.repository.delete(actor.tenantId);
    return { message: 'Mailbox disconnected' };
  }
}
