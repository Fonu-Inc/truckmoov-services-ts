import { Inject, Injectable } from "@nestjs/common";
import { AuthUser } from "../domain/entities/auth-user.entity";
import { InvalidCredentialsError } from "../domain/errors/invalid-credentials.error";
import type { IdentityProvider } from "../domain/ports/identity-provider.port";
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from "../domain/ports/password-hasher.port";
import { USER_REPOSITORY, type UserRepository } from "../domain/ports/user-repository.port";

@Injectable()
export class DbIdentityProvider implements IdentityProvider {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async verifyCredentials(email: string, password: string): Promise<AuthUser> {
    const stored = await this.userRepo.findByEmail(email);
    if (!stored) throw new InvalidCredentialsError();

    const valid = await this.passwordHasher.verify(password, stored.passwordHash);
    if (!valid) throw new InvalidCredentialsError();

    return AuthUser.create({
      id: stored.id,
      email: stored.email,
      role: stored.role,
      tenantId: stored.tenantId,
    });
  }
}
