import { Inject, Injectable } from '@nestjs/common';
import { Role } from '@shared/rbac';
import {
  AUTH_NOTIFIER,
  EmailTakenError,
  ID_GENERATOR,
  INVITE_REPOSITORY,
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

export type CreateSystemAdminInviteCommand = {
  accessToken: string;
  email: string;
};

@Injectable()
export class CreateSystemAdminInviteUseCase {
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

  async execute(command: CreateSystemAdminInviteCommand) {
    const actor = await ensureSystemActor(
      command.accessToken,
      this.tokenService,
      this.userRepository,
      {
        allowedRoles: SUPER_ADMIN_ONLY,
        forbiddenMessage: 'Only the super admin can invite system admins',
      },
    );

    const email = command.email.trim().toLowerCase();
    const [existingUser, existingInvite] = await Promise.all([
      this.userRepository.findByEmail(email),
      this.inviteRepository.findByEmail(email),
    ]);
    if (existingUser || existingInvite) {
      throw new EmailTakenError();
    }

    const now = new Date();
    const invite = {
      id: this.idGenerator.generate(),
      email,
      role: Role.SYSTEM_ADMIN,
      tenantId: SYSTEM_TENANT_ID,
      token: this.idGenerator.generate(),
      invitedBy: actor.id,
      status: 'pending' as const,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      createdAt: now,
    };

    await this.inviteRepository.save(invite);
    await this.notifier.sendInviteEmail({
      email: invite.email,
      role: invite.role,
      inviteToken: invite.token,
    });

    return {
      status: true,
      message: 'System admin invitation sent',
      data: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        tenantId: invite.tenantId,
        invitedBy: invite.invitedBy,
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
      },
    };
  }
}
