import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@shared/rbac';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_TENANT_ID } from './system-authz';
import {
  INVITE_REPOSITORY,
  type InviteRepository,
  type StoredInvite,
} from './contexts/auth/session/domain/ports/invite-repository.port';

const SUPER_ADMIN_ONLY = new Set<string>([Role.SUPER_ADMIN]);

@Injectable()
export class ListSystemAdminInvitesUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepository: InviteRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SUPER_ADMIN_ONLY,
      forbiddenMessage: 'Only the super admin can view system admin invites',
    });

    const now = new Date();
    const invites = (await this.inviteRepository.listPendingByTenant(SYSTEM_TENANT_ID))
      .filter(
        (invite) =>
          invite.role === Role.SYSTEM_ADMIN && invite.expiresAt.getTime() > now.getTime(),
      )
      .map((invite) => this.toView(invite));

    return {
      status: true,
      message: 'success',
      data: {
        total: invites.length,
        invites,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private toView(invite: StoredInvite) {
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      tenantId: invite.tenantId,
      invitedBy: invite.invitedBy,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
    };
  }
}
