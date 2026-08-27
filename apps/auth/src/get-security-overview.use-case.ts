import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { AUTH_EVENT_REPOSITORY, type AuthEventRepository } from './auth-event.repository';
import { BLOCKED_IP_REPOSITORY, type BlockedIpRepository } from './blocked-ip.repository';
import { SECURITY_EVENT_REPOSITORY, type SecurityEventRepository } from './security-event.repository';

@Injectable()
export class GetSecurityOverviewUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(AUTH_EVENT_REPOSITORY) private readonly authEvents: AuthEventRepository,
    @Inject(BLOCKED_IP_REPOSITORY) private readonly blockedIps: BlockedIpRepository,
    @Inject(SECURITY_EVENT_REPOSITORY) private readonly securityEvents: SecurityEventRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view the security overview',
    });

    const dayAgo = new Date(Date.now() - 24 * 3_600_000);
    const [failedLoginsToday, successfulLoginsToday, activeBlocks, criticalEventsToday, highEventsToday] =
      await Promise.all([
        this.authEvents.countSince('failed', 'login', dayAgo),
        this.authEvents.countSince('success', 'login', dayAgo),
        this.blockedIps.countActive(),
        this.securityEvents.countBySeverity('critical', dayAgo),
        this.securityEvents.countBySeverity('high', dayAgo),
      ]);

    return {
      status: true,
      message: 'Security overview retrieved',
      data: { failedLoginsToday, successfulLoginsToday, activeBlocks, criticalEventsToday, highEventsToday },
    };
  }
}
