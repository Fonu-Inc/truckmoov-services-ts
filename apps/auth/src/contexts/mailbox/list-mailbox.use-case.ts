import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from '../auth/session';
import { resolveActorUser } from '../auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from '../auth/session/domain/ports/token-service.port';
import type { UserRepository } from '../auth/session/domain/ports/user-repository.port';
import type { MailMessage } from './mailbox.domain';
import { MAILBOX_REPOSITORY, type MailboxRepository, type ThreadPage } from './mailbox.repository';

const MAX_THREADS_PER_PAGE = 100;

/**
 * Reads the aggregated mailbox. Scoped to the caller's own tenant, always:
 * the tenant comes from the verified token and is never taken from a parameter.
 */
@Injectable()
export class ListMailboxUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(MAILBOX_REPOSITORY) private readonly repository: MailboxRepository,
  ) {}

  async listThreads(accessToken: string, limit = 25, offset = 0): Promise<ThreadPage> {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    const bounded = Math.min(Math.max(limit, 1), MAX_THREADS_PER_PAGE);
    return this.repository.listThreads(actor.tenantId, bounded, Math.max(offset, 0));
  }

  async readThread(accessToken: string, threadId: string): Promise<MailMessage[]> {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    return this.repository.listMessagesInThread(actor.tenantId, threadId);
  }
}
