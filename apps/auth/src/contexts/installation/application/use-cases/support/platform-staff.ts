import type { PermissionKey } from '@shared/access';
import { ForbiddenError } from '@auth/session/domain/errors/forbidden.error';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import type { AccessResolver } from '../../../../../access-resolver';

export type Staff = { id: string; email: string; role: string };

/**
 * The admin-portal caller holding `permission`, checked here as well as on
 * the route: the route rule only records until enforcement is switched on.
 */
export async function requireStaff(
  deps: { tokens: TokenService; access: AccessResolver; users: UserRepository },
  accessToken: string,
  permission: PermissionKey,
): Promise<Staff> {
  const user = deps.tokens.resolveAccessToken(accessToken);
  const access = user ? await deps.access.resolve(deps.users, user.id) : null;
  if (!user || !access?.active || access.portal !== 'admin' || !access.permissions.includes(permission)) {
    throw new ForbiddenError();
  }
  return { id: user.id, email: user.email, role: user.role };
}
