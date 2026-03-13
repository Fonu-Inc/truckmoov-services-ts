import { Inject, Injectable } from "@nestjs/common";
import { AUTH_NOTIFIER, type AuthNotifier } from "@auth/session/domain/ports/auth-notifier.port";
import { ID_GENERATOR, type IdGenerator } from "@auth/session/domain/ports/id-generator.port";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { PASSWORD_RESET_STORE, type PasswordResetStore } from "../../domain/ports/password-reset-store.port";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";

export type ForgotPasswordCommand = {
  identifier: string;
};

@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(PASSWORD_RESET_STORE)
    private readonly resetStore: PasswordResetStore,
    @Inject(AUTH_NOTIFIER)
    private readonly notifier: AuthNotifier,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: ForgotPasswordCommand) {
    const user = await this.userRepo.findByEmail(command.identifier);
    if (!user) throw new UserNotFoundError();

    const token = this.idGenerator.generate();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.resetStore.save({
      id: this.idGenerator.generate(),
      userId: user.id,
      token,
      method: "email",
      code: null,
      used: false,
      expiresAt,
      createdAt: new Date(),
    });

    await this.notifier.sendPasswordResetEmail({
      email: command.identifier,
      resetToken: token,
    });

    return { message: "Password reset link sent to your email" };
  }
}
