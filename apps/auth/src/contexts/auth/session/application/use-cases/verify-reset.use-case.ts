import { Inject, Injectable } from "@nestjs/common";
import { PASSWORD_RESET_STORE, type PasswordResetStore } from "../../domain/ports/password-reset-store.port";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { InvalidResetTokenError } from "../../domain/errors/invalid-reset-token.error";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";

export type VerifyResetCommand =
  | { method: "email"; token: string }
  | { method: "sms"; identifier: string; code: string };

@Injectable()
export class VerifyResetUseCase {
  constructor(
    @Inject(PASSWORD_RESET_STORE)
    private readonly resetStore: PasswordResetStore,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
  ) {}

  async execute(command: VerifyResetCommand) {
    if (command.method === "email") {
      const reset = await this.resetStore.findByToken(command.token);
      if (!reset || reset.expiresAt < new Date()) throw new InvalidResetTokenError();
      return { valid: true, token: reset.token };
    }

    const user = await this.userRepo.findByUsername(command.identifier);
    if (!user) throw new UserNotFoundError();

    const reset = await this.resetStore.findByUserIdAndCode(user.id, command.code);
    if (!reset || reset.expiresAt < new Date()) throw new InvalidResetTokenError();

    return { valid: true, token: reset.token };
  }
}
