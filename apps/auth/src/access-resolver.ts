import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ACCESS_CHANGED_SUBJECT, predefinedRole, type PermissionKey } from '@shared/access';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';
import { SYSTEM_TENANT_ID, portalFor, type Portal } from '@shared/identity';
import type { StoredUser, UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';

export type ResolvedAccess = {
  userId: string;
  tenantId: string;
  portal: Portal;
  /** False for a disabled or deleted account: refused on its next request, everywhere. */
  active: boolean;
  permissions: PermissionKey[];
};

const CACHE_TTL_MS = 30_000;

/** What a user may do right now, read from the account rather than from their token. */
@Injectable()
export class AccessResolver {
  private readonly cache = new Map<string, { access: ResolvedAccess | null; at: number }>();

  async resolve(userRepository: Pick<UserRepository, 'findById'>, userId: string): Promise<ResolvedAccess | null> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.access;
    const access = toAccess(await userRepository.findById(userId));
    this.cache.set(userId, { access, at: Date.now() });
    return access;
  }

  forget(userId: string): void {
    this.cache.delete(userId);
  }
}

function toAccess(user: StoredUser | null): ResolvedAccess | null {
  if (!user) return null;
  const bundle = predefinedRole(user.role);
  const portal = portalFor(user);
  // A role that does not belong to the user's portal carries nothing: a
  // system role held inside a tenant is worth no permissions at all.
  const permissions = bundle && bundle.portal === portal ? [...bundle.permissions] : [];
  return {
    userId: user.id,
    tenantId: user.tenantId,
    portal,
    active: (user.accountStatus ?? 'enabled') === 'enabled',
    permissions,
  };
}

/** Tells this service and every other one that a user's access changed. */
@Injectable()
export class AccessChangeNotifier {
  private readonly logger = new Logger(AccessChangeNotifier.name);

  constructor(
    @Inject(AccessResolver) private readonly resolver: AccessResolver,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {}

  changed(userId: string): void {
    this.resolver.forget(userId);
    this.bus
      .publish(ACCESS_CHANGED_SUBJECT, {
        id: randomUUID(),
        type: 'access.changed',
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: SYSTEM_TENANT_ID,
        data: { userId },
      })
      .catch((error: Error) => this.logger.warn(`access_changed_publish_failed:${userId}:${error.message}`));
  }
}
