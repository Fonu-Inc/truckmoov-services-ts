import { ForbiddenError } from "../../../domain/errors/forbidden.error";
import { UserNotFoundError } from "../../../domain/errors/user-not-found.error";
import type { TokenService } from "../../../domain/ports/token-service.port";
import {
  type StoredUser,
  type UserRepository,
  normalizeStoredUser,
} from "../../../domain/ports/user-repository.port";

/**
 * Resolves the authenticated principal from an access token and
 * hydrates the latest user record from the repository.
 */
export async function resolveActorUser(
  accessToken: string,
  tokenService: TokenService,
  userRepo: UserRepository,
): Promise<StoredUser> {
  const actor = tokenService.resolveAccessToken(accessToken);
  if (!actor) {
    throw new ForbiddenError();
  }

  const storedUser = await userRepo.findById(actor.id);
  if (!storedUser) {
    throw new UserNotFoundError();
  }

  return normalizeStoredUser(storedUser);
}
