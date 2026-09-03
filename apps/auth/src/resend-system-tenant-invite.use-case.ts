import { Inject, Injectable } from '@nestjs/common';
import {
  AUTH_NOTIFIER,
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
import { GetSystemTenantUseCase } from './get-system-tenant.use-case';
import { ensureSystemActor } from './system-authz';
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

export class SystemTenantInviteResendConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type ResendSystemTenantInviteCommand = {
  accessToken: string;
  tenantId: string;
};

@Injectable()
export class ResendSystemTenantInviteUseCase {
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
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly tenantOnboardingRepository: TenantOnboardingRepository,
    @Inject(GetSystemTenantUseCase)
    private readonly getSystemTenantUseCase: GetSystemTenantUseCase,
  ) {}

  async execute(command: ResendSystemTenantInviteCommand) {
    const actor = await ensureSystemActor(
      command.accessToken,
      this.tokenService,
      this.userRepository,
    );

    await this.getSystemTenantUseCase.execute(
      command.accessToken,
      command.tenantId,
    );

    const onboarding = await this.tenantOnboardingRepository.findByTenantId(
      command.tenantId,
    );
    if (!onboarding) {
      throw new SystemTenantInviteResendConflictError(
        'Tenant does not have a managed onboarding invite to resend',
      );
    }

    const existingUsers = await this.userRepository.findAllByTenant(
      command.tenantId,
    );
    if (existingUsers.length > 0 || onboarding.status === 'managed') {
      throw new SystemTenantInviteResendConflictError(
        'Tenant invitation can no longer be resent after onboarding has been accepted',
      );
    }

    await this.inviteRepository.deleteByTenantId(command.tenantId);

    const now = new Date();
    const invite = {
      id: this.idGenerator.generate(),
      email: onboarding.invitedEmail,
      role: onboarding.bootstrapRole,
      tenantId: onboarding.tenantId,
      token: this.idGenerator.generate(),
      invitedBy: actor.id,
      status: 'pending' as const,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      createdAt: now,
    };

    await this.inviteRepository.save(invite);
    await this.notifier.sendTenantInviteEmail({
      email: invite.email,
      role: invite.role,
      inviteToken: invite.token,
    });

    return {
      status: true,
      message: 'Tenant invitation resent',
      data: {
        tenantId: invite.tenantId,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
        createdAt: invite.createdAt.toISOString(),
      },
    };
  }
}
