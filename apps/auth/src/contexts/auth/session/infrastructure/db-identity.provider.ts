import { Inject, Injectable } from "@nestjs/common";
import { AuthUser } from "../domain/entities/auth-user.entity";
import { InvalidCredentialsError } from "../domain/errors/invalid-credentials.error";
import type { IdentityProvider } from "../domain/ports/identity-provider.port";
import { USER_REPOSITORY, type UserRepository } from "../domain/ports/user-repository.port";
import { verifyPassword } from "./password";

@Injectable()
export class DbIdentityProvider implements IdentityProvider {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
  ) {}

  async verifyCredentials(username: string, password: string): Promise<AuthUser> {
    const stored = await this.userRepo.findByUsername(username);
    if (!stored) throw new InvalidCredentialsError();

    const valid = await verifyPassword(password, stored.passwordHash);
    if (!valid) throw new InvalidCredentialsError();

    return AuthUser.create({
      id: stored.id,
      username: stored.username,
      roles: stored.roles,
      tenantId: stored.tenantId,
    });
  }
}
