import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { MailerService } from "@shared/mailer";
import { AppConfigService } from "@shared/config";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { PASSWORD_RESET_STORE, type PasswordResetStore } from "../../domain/ports/password-reset-store.port";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";
import {
  FORGOT_PASSWORD_SUBJECT,
  FORGOT_PASSWORD_EMAIL_TEMPLATE,
} from "@auth/templates/forgot-password.template";

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
    @Inject(MailerService)
    private readonly mailer: MailerService,
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
  ) {}

  async execute(command: ForgotPasswordCommand) {
    const user = await this.userRepo.findByUsername(command.identifier);
    if (!user) throw new UserNotFoundError();

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.resetStore.save({
      id: randomUUID(),
      userId: user.id,
      token,
      method: "email",
      code: null,
      used: false,
      expiresAt,
      createdAt: new Date(),
    });

    const resetLink = `${this.config.app.frontendUrl}/reset-password?token=${token}`;
    await this.mailer.send({
      to: command.identifier,
      subject: FORGOT_PASSWORD_SUBJECT,
      template: FORGOT_PASSWORD_EMAIL_TEMPLATE,
      variables: { resetLink, year: String(new Date().getFullYear()) },
    });

    return { message: "Password reset link sent to your email" };
  }
}
