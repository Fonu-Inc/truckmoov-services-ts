import { Inject, Injectable } from "@nestjs/common";
import { randomUUID, randomInt } from "node:crypto";
import { MailerService } from "@shared/mailer";
import { SmsService } from "@shared/sms";
import { AppConfigService } from "@shared/config";
import { USER_REPOSITORY, type UserRepository } from "../../domain/ports/user-repository.port";
import { PASSWORD_RESET_STORE, type PasswordResetStore } from "../../domain/ports/password-reset-store.port";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";
import {
  FORGOT_PASSWORD_SUBJECT,
  FORGOT_PASSWORD_EMAIL_TEMPLATE,
  FORGOT_PASSWORD_SMS_TEMPLATE,
} from "@auth/templates/forgot-password.template";

export type ForgotPasswordCommand = {
  identifier: string;
  method: "email" | "sms";
  phone?: string;
};

@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(PASSWORD_RESET_STORE)
    private readonly resetStore: PasswordResetStore,
    private readonly mailer: MailerService,
    private readonly sms: SmsService,
    private readonly config: AppConfigService,
  ) {}

  async execute(command: ForgotPasswordCommand) {
    const user = await this.userRepo.findByUsername(command.identifier);
    if (!user) throw new UserNotFoundError();

    const token = randomUUID();
    const code = command.method === "sms" ? String(randomInt(100000, 999999)) : null;
    const expiresAt =
      command.method === "email"
        ? new Date(Date.now() + 60 * 60 * 1000)
        : new Date(Date.now() + 10 * 60 * 1000);

    await this.resetStore.save({
      id: randomUUID(),
      userId: user.id,
      token,
      method: command.method,
      code,
      used: false,
      expiresAt,
      createdAt: new Date(),
    });

    if (command.method === "email") {
      const resetLink = `${this.config.app.frontendUrl}/reset-password?token=${token}`;
      await this.mailer.send({
        to: command.identifier,
        subject: FORGOT_PASSWORD_SUBJECT,
        template: FORGOT_PASSWORD_EMAIL_TEMPLATE,
        variables: { resetLink, year: String(new Date().getFullYear()) },
      });
    } else {
      if (!command.phone) throw new Error("Phone number is required for SMS method");
      await this.sms.send({
        to: command.phone,
        template: FORGOT_PASSWORD_SMS_TEMPLATE,
        variables: { code: code! },
      });
    }

    return { message: `Password reset sent via ${command.method}`, method: command.method };
  }
}
