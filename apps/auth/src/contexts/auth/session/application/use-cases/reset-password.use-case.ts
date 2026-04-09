import { Inject, Injectable } from "@nestjs/common";
import { PASSWORD_HASHER, type PasswordHasher } from "@auth/session/domain/ports/password-hasher.port";
import { PASSWORD_RESET_STORE, type PasswordResetStore } from "../../domain/ports/password-reset-store.port";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { SESSION_STORE, type SessionStore } from "../../domain/ports/session-store.port";
import { InvalidResetTokenError } from "../../domain/errors/invalid-reset-token.error";

export type ResetPasswordCommand = {
  token: string;
  newPassword: string;
};

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(PASSWORD_RESET_STORE)
    private readonly resetStore: PasswordResetStore,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(SESSION_STORE)
    private readonly sessionStore: SessionStore,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(command: ResetPasswordCommand) {
    const reset = await this.resetStore.findByToken(command.token);
    if (!reset || reset.expiresAt < new Date()) throw new InvalidResetTokenError();
    const user = await this.userRepo.findById(reset.userId);

    const passwordHash = await this.passwordHasher.hash(command.newPassword);
    await this.userRepo.updatePassword(reset.userId, passwordHash);
    await this.resetStore.markUsed(command.token);

    await this.sessionStore.deleteAllForUser(reset.userId);

    return {
      message: "Password has been reset successfully",
      userId: reset.userId,
      tenantId: user?.tenantId ?? "",
      email: user?.email ?? null,
      role: user?.role ?? null,
    };
  }
}
