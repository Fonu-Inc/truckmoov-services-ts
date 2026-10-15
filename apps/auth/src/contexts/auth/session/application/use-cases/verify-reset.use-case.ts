import { Inject, Injectable } from "@nestjs/common";
import { PASSWORD_RESET_STORE, type PasswordResetStore } from "../../domain/ports/password-reset-store.port";
import { InvalidResetTokenError } from "../../domain/errors/invalid-reset-token.error";

export type VerifyResetCommand = {
  token: string;
};

@Injectable()
export class VerifyResetUseCase {
  constructor(
    @Inject(PASSWORD_RESET_STORE)
    private readonly resetStore: PasswordResetStore,
  ) {}

  async execute(command: VerifyResetCommand) {
    const reset = await this.resetStore.findByToken(command.token);
    if (!reset || reset.expiresAt < new Date()) throw new InvalidResetTokenError();
    return { valid: true, token: command.token };
  }
}
