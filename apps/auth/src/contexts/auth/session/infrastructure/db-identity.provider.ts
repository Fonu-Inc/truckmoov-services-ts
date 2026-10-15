import { Inject, Injectable } from "@nestjs/common";
import { AuthUser } from "../domain/entities/auth-user.entity";
import { EmailNotVerifiedError } from "../domain/errors/email-not-verified.error";
import { ForbiddenError } from "../domain/errors/forbidden.error";
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

    // Checked after the password, so a disabled or unverified account cannot
    // be distinguished from an unregistered one without the right password.
    if (stored.accountStatus === "disabled") {
      throw new ForbiddenError("This account has been disabled");
    }
    if (stored.emailVerificationToken) {
      throw new EmailNotVerifiedError();
    }

    return AuthUser.create({
      id: stored.id,
      email: stored.email,
      role: stored.role,
      tenantId: stored.tenantId,
    });
  }
}
