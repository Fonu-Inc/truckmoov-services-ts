import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@shared/rbac';
import {
  AUTH_NOTIFIER,
  ID_GENERATOR,
  INVITE_REPOSITORY,
  InviteNotFoundError,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from './contexts/auth/session';
import type { AuthNotifier } from './contexts/auth/session/domain/ports/auth-notifier.port';
import type { IdGenerator } from './contexts/auth/session/domain/ports/id-generator.port';
import type { InviteRepository } from './contexts/auth/session/domain/ports/invite-repository.port';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_TENANT_ID } from './system-authz';

const SUPER_ADMIN_ONLY = new Set<string>([Role.SUPER_ADMIN]);
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export type ResendSystemAdminInviteCommand = {
  accessToken: string;
  inviteId: string;
};

@Injectable()
export class ResendSystemAdminInviteUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepository: InviteRepository,
    @Inject(AUTH_NOTIFIER)
    private readonly notifier: AuthNotifier,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: ResendSystemAdminInviteCommand) {
    const actor = await ensureSystemActor(
      command.accessToken,
      this.tokenService,
      this.userRepository,
      {
        allowedRoles: SUPER_ADMIN_ONLY,
        forbiddenMessage: 'Only the super admin can resend system admin invites',
      },
    );

    const current = await this.inviteRepository.findById(command.inviteId);
    if (
      !current ||
      current.tenantId !== SYSTEM_TENANT_ID ||
      current.role !== Role.SYSTEM_ADMIN ||
      current.status !== 'pending'
    ) {
      throw new InviteNotFoundError();
    }

    const refreshedInvite = {
      ...current,
      token: this.idGenerator.generate(),
      invitedBy: actor.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      createdAt: new Date(),
    };

    await this.inviteRepository.save(refreshedInvite);
    await this.notifier.sendInviteEmail({
      email: refreshedInvite.email,
      role: refreshedInvite.role,
      inviteToken: refreshedInvite.token,
    });

    return {
      status: true,
      message: 'System admin invitation resent',
      data: {
        id: refreshedInvite.id,
        email: refreshedInvite.email,
        role: refreshedInvite.role,
        tenantId: refreshedInvite.tenantId,
        invitedBy: refreshedInvite.invitedBy,
        expiresAt: refreshedInvite.expiresAt.toISOString(),
        createdAt: refreshedInvite.createdAt.toISOString(),
      },
    };
  }
}
