import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@shared/rbac';
import {
  INVITE_REPOSITORY,
  InviteNotFoundError,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from './contexts/auth/session';
import type { InviteRepository } from './contexts/auth/session/domain/ports/invite-repository.port';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { SYSTEM_TENANT_ID } from '@shared/identity';

const SUPER_ADMIN_ONLY = new Set<string>([Role.SUPER_ADMIN]);

@Injectable()
export class CancelSystemAdminInviteUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepository: InviteRepository,
  ) {}

  async execute(accessToken: string, inviteId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SUPER_ADMIN_ONLY,
      forbiddenMessage: 'Only the super admin can cancel system admin invites',
    });

    const current = await this.inviteRepository.findById(inviteId);
    if (
      !current ||
      current.tenantId !== SYSTEM_TENANT_ID ||
      current.role !== Role.SYSTEM_ADMIN ||
      current.status !== 'pending'
    ) {
      throw new InviteNotFoundError();
    }

    await this.inviteRepository.deleteById(inviteId);

    return {
      status: true,
      message: 'System admin invitation cancelled',
      data: {
        id: current.id,
        email: current.email,
        cancelled: true,
      },
    };
  }
}
