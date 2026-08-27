import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  AUTH_EVENT_REPOSITORY,
  type AuthEventFilters,
  type AuthEventRepository,
} from './auth-event.repository';

@Injectable()
export class ListSystemAuthEventsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(AUTH_EVENT_REPOSITORY) private readonly authEvents: AuthEventRepository,
  ) {}

  async execute(accessToken: string, filters: AuthEventFilters) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view authentication activity',
    });
    const page = await this.authEvents.search(filters);
    return { status: true, message: 'Authentication events retrieved', data: page };
  }
}

@Injectable()
export class ListSystemFailedLoginsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(AUTH_EVENT_REPOSITORY) private readonly authEvents: AuthEventRepository,
  ) {}

  async execute(accessToken: string, filters: AuthEventFilters) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view authentication activity',
    });
    const page = await this.authEvents.searchFailedLogins(filters);
    return { status: true, message: 'Failed logins retrieved', data: page };
  }
}
