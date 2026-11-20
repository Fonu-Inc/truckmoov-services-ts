import { Controller, Get, Headers, Inject, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Portals } from '@shared/access';
import { USER_REPOSITORY } from './contexts/auth/session';
import type { StoredUser, UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { InternalCallerService, type IncomingHeaders } from './internal-caller.service';

/** Who in a tenant hears about job offers first: the people who dispatch, then the people who run the organisation. */
const CONTACT_ROLE_ORDER = [
  'DISPATCHER',
  'OPERATIONS_MANAGER',
  'OWNER_OPERATOR',
  'ENTERPRISE_ADMIN',
  'AGGREGATOR_ADMIN',
] as const;

export function pickTenantContact(users: readonly StoredUser[]): StoredUser | null {
  const enabled = users.filter((user) => user.accountStatus !== 'disabled' && user.email.trim() !== '');
  for (const role of CONTACT_ROLE_ORDER) {
    const match = enabled.find((user) => user.role === role);
    if (match) return match;
  }
  return null;
}

/**
 * Where to reach a tenant, for the notification service.
 *
 * A job offer goes to another organisation, so the sender knows a tenant id and
 * nothing else about it. Auth owns the users, so the contact is read here
 * rather than copied into the notification service.
 */
@ApiExcludeController()
@Portals('service')
@Controller('internal/tenant-contact')
export class InternalTenantContactController {
  constructor(
    @Inject(InternalCallerService) private readonly callers: InternalCallerService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  @Get()
  async contact(@Headers() headers: IncomingHeaders) {
    const tenantId = await this.callers.tenantFor(headers, ['notification']);
    if (!tenantId) throw new UnauthorizedException('Invalid service token');

    const user = pickTenantContact(await this.users.findAllByTenant(tenantId));
    const data = user ? { email: user.email, phone: user.profile?.phoneNumber ?? null } : null;
    return { status: true, message: 'success', data };
  }
}
