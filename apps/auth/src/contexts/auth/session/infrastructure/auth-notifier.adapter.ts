import { Inject, Injectable } from "@nestjs/common";
import type {
  AuthNotifier,
  InviteEmail,
  PasswordResetEmail,
} from "@auth/session/domain/ports/auth-notifier.port";
import { AppConfigService } from "@shared/config";
import { MailerService } from "@shared/mailer";
import { INVITE_USER_SUBJECT, INVITE_USER_TEMPLATE } from "@auth/templates/invite-user.template";
import {
  FORGOT_PASSWORD_EMAIL_TEMPLATE,
  FORGOT_PASSWORD_SUBJECT,
} from "@auth/templates/forgot-password.template";

@Injectable()
export class MailerAuthNotifier implements AuthNotifier {
  constructor(
    @Inject(MailerService)
    private readonly mailer: MailerService,
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
  ) {}

  async sendInviteEmail(input: InviteEmail): Promise<void> {
    const inviteLink = `${this.config.app.frontendUrl}/register?invite=${input.inviteToken}`;

    await this.mailer.send({
      to: input.email,
      subject: INVITE_USER_SUBJECT,
      template: INVITE_USER_TEMPLATE,
      variables: {
        role: formatRole(input.role),
        inviteLink,
        year: String(new Date().getFullYear()),
      },
    });
  }

  async sendPasswordResetEmail(input: PasswordResetEmail): Promise<void> {
    const resetLink = `${this.config.app.frontendUrl}/reset-password?token=${input.resetToken}`;

    await this.mailer.send({
      to: input.email,
      subject: FORGOT_PASSWORD_SUBJECT,
      template: FORGOT_PASSWORD_EMAIL_TEMPLATE,
      variables: {
        resetLink,
        year: String(new Date().getFullYear()),
      },
    });
  }
}

function formatRole(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
