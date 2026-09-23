import { Inject, Injectable } from '@nestjs/common';
import { SYSTEM_ROLES } from '@shared/rbac';
import { holdsMisplacedSystemRole } from '@shared/identity';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type {
  StoredUser,
  UserRepository,
} from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';

/**
 * Accounts holding a system role outside the system tenant, for the governance
 * team to review. Read-only: these accounts may be mid-onboarding, so nothing
 * here changes them.
 */
@Injectable()
export class ListMisplacedSystemAccountsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);

    const accounts = (await this.userRepository.findByRoles(SYSTEM_ROLES))
      .filter(holdsMisplacedSystemRole)
      .map((user) => this.toView(user));

    return {
      status: true,
      message: 'success',
      data: {
        total: accounts.length,
        accounts,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private toView(user: StoredUser) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      accountStatus: user.accountStatus ?? 'enabled',
    };
  }
}
