import { Inject, Injectable } from '@nestjs/common';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  InvalidAccessTokenError,
} from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';

export type TenantStatus = {
  tenantId: string;
  active: boolean;
};

/**
 * Answers "is this tenant still active" for other services.
 *
 * Deliberately does not go through resolveActorUser, which throws on a disabled
 * account. A caller needs the answer as a value: a thrown 403 cannot be told
 * apart from auth being unreachable, and the two demand opposite handling.
 */
@Injectable()
export class GetTenantStatusUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  async execute(accessToken: string): Promise<TenantStatus> {
    const actor = this.tokenService.resolveAccessToken(accessToken);
    if (!actor) throw new InvalidAccessTokenError();

    const storedUser = await this.userRepository.findById(actor.id);

    // A token whose user no longer exists is treated as inactive rather than as
    // an error. Suspension deletes nothing, but a deleted user must not keep
    // working in another service either.
    return {
      tenantId: actor.tenantId,
      active: storedUser !== null && storedUser.accountStatus !== 'disabled',
    };
  }
}
