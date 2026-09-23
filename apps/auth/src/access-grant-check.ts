import { Inject, Injectable } from '@nestjs/common';
import { predefinedRole } from '@shared/access';
import { AccessResolver } from './access-resolver';
import { USER_REPOSITORY } from './contexts/auth/session';
import type { GrantCheck } from './contexts/auth/session/domain/ports/grant-check.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';

@Injectable()
export class AccessGrantCheck implements GrantCheck {
  constructor(
    @Inject(AccessResolver) private readonly access: AccessResolver,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async mayGrantRole(actorUserId: string, role: string): Promise<boolean> {
    const bundle = predefinedRole(role);
    const actor = await this.access.resolve(this.users, actorUserId);
    if (!bundle || !actor?.active) return false;
    return bundle.permissions.every((permission) => actor.permissions.includes(permission));
  }
}
