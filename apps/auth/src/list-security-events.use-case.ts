import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  SECURITY_EVENT_REPOSITORY,
  type SecurityEventFilters,
  type SecurityEventRepository,
} from './security-event.repository';

@Injectable()
export class ListSecurityEventsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SECURITY_EVENT_REPOSITORY) private readonly securityEvents: SecurityEventRepository,
  ) {}

  async execute(accessToken: string, filters: SecurityEventFilters) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view security events',
    });
    const page = await this.securityEvents.search(filters);
    return { status: true, message: 'Security events retrieved', data: page };
  }
}
