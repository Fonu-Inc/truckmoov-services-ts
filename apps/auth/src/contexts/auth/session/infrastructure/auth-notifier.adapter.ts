import { Inject, Injectable } from "@nestjs/common";
import type {
  AuthNotifier,
  InviteEmail,
  PasswordResetEmail,
  VerificationEmail,
} from "@auth/session/domain/ports/auth-notifier.port";
import { AppConfigService } from "@shared/config";
import { MailerService } from "@shared/mailer";
import { INVITE_USER_SUBJECT, INVITE_USER_TEMPLATE } from "@auth/templates/invite-user.template";
import {
  FORGOT_PASSWORD_EMAIL_TEMPLATE,
  FORGOT_PASSWORD_SUBJECT,
} from "@auth/templates/forgot-password.template";
import {
  VERIFY_EMAIL_SUBJECT,
  VERIFY_EMAIL_TEMPLATE,
} from "@auth/templates/verify-email.template";

@Injectable()
export class MailerAuthNotifier implements AuthNotifier {
  constructor(
    @Inject(MailerService)
    private readonly mailer: MailerService,
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
  ) {}

  async sendInviteEmail(input: InviteEmail): Promise<void> {
    const inviteLink = `${this.config.app.frontendUrl}${this.config.app.inviteAcceptPath}?invite=${input.inviteToken}`;

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

  async sendVerificationEmail(input: VerificationEmail): Promise<void> {
    const verificationLink = `${this.config.app.frontendUrl}${this.config.app.emailVerificationPath}?token=${input.verificationToken}`;

    await this.mailer.send({
      to: input.email,
      subject: VERIFY_EMAIL_SUBJECT,
      template: VERIFY_EMAIL_TEMPLATE,
      variables: {
        firstName: input.firstName,
        email: input.email,
        verificationLink,
        year: String(new Date().getFullYear()),
      },
    });
  }
}

function formatRole(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
