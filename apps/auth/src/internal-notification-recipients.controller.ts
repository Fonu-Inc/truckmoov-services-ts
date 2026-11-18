import { Controller, Get, Headers, Inject, Query, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Portals } from '@shared/access';
import { USER_REPOSITORY } from './contexts/auth/session';
import { normalizeStoredUser, type UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { InternalCallerService, type IncomingHeaders } from './internal-caller.service';
import { TENANT_ONBOARDING_REPOSITORY, type TenantOnboardingRepository } from './tenant-onboarding.repository';

function csv(value: string | undefined): Set<string> | null {
  const items = (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  return items.length ? new Set(items) : null;
}

/** Who in a tenant can be pushed to, for the notification service. Auth owns the users and their toggles. */
@ApiExcludeController()
@Portals('service')
@Controller('internal/notification-recipients')
export class InternalNotificationRecipientsController {
  constructor(
    @Inject(InternalCallerService) private readonly callers: InternalCallerService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY) private readonly onboarding: TenantOnboardingRepository,
  ) {}

  @Get()
  async recipients(
    @Headers() headers: IncomingHeaders,
    @Query('userIds') userIds?: string,
    @Query('roles') roles?: string,
  ) {
    const tenantId = await this.callers.tenantFor(headers, ['notification']);
    if (!tenantId) throw new UnauthorizedException('Invalid service token');

    const ids = csv(userIds);
    const wanted = csv(roles);
    const [users, onboarding] = await Promise.all([
      this.users.findAllByTenant(tenantId),
      this.onboarding.findByTenantId(tenantId),
    ]);
    const organizationType = onboarding?.organizationType ?? null;

    const data = users
      .map(normalizeStoredUser)
      .filter((user) => user.accountStatus !== 'disabled')
      .filter((user) => !ids || ids.has(user.id))
      .filter((user) => !wanted || wanted.has(user.role))
      .map((user) => ({ id: user.id, role: user.role, organizationType, preferences: user.notificationPreferences }));
    return { status: true, message: 'success', data };
  }
}
