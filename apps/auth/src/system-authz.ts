import { Role } from '@shared/rbac';
import { ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';

export const SYSTEM_TENANT_ID = 'system';
export const SYSTEM_VIEWER_ROLES = new Set<string>([
  Role.SUPER_ADMIN,
  Role.SYSTEM_ADMIN,
]);
export const SYSTEM_MUTATOR_ROLES = SYSTEM_VIEWER_ROLES;

export async function ensureSystemActor(
  accessToken: string,
  tokenService: TokenService,
  userRepository: UserRepository,
  options?: {
    allowedRoles?: Set<string>;
    forbiddenMessage?: string;
  },
) {
  const actor = await resolveActorUser(
    accessToken,
    tokenService,
    userRepository,
  );
  const allowedRoles = options?.allowedRoles ?? SYSTEM_VIEWER_ROLES;
  if (actor.tenantId !== SYSTEM_TENANT_ID || !allowedRoles.has(actor.role)) {
    throw new ForbiddenError(
      options?.forbiddenMessage ??
        'You are not permitted to access this resource',
    );
  }
  return actor;
}
