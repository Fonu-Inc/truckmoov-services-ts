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

  async sendTenantInviteEmail(input: InviteEmail): Promise<void> {
    await this.sendInvite(input, this.config.app.tenantAppUrl);
  }

  async sendPlatformInviteEmail(input: InviteEmail): Promise<void> {
    await this.sendInvite(input, this.config.app.adminAppUrl);
  }

  async sendInstallerInviteEmail(input: InviteEmail): Promise<void> {
    await this.sendInvite(input, this.config.app.installerAppUrl);
  }

  private async sendInvite(input: InviteEmail, baseUrl: string): Promise<void> {
    const inviteLink = new URL(this.config.app.inviteAcceptPath, baseUrl);
    // The invite email is deliberately duplicated in the link so the frontend
    // can show the invited address before the invited-registration call runs.
    inviteLink.searchParams.set("invite", input.inviteToken);
    inviteLink.searchParams.set("email", input.email);

    await this.mailer.send({
      to: input.email,
      subject: INVITE_USER_SUBJECT,
      template: INVITE_USER_TEMPLATE,
      variables: {
        role: formatRole(input.role),
        inviteLink: inviteLink.toString(),
        year: String(new Date().getFullYear()),
      },
    });
  }

  async sendPasswordResetEmail(input: PasswordResetEmail): Promise<void> {
    const resetLink = `${this.config.app.frontendUrl}${this.config.app.emailVerificationPath}?token=${input.resetToken}&type=reset-password`;

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
    const verificationLink = `${this.config.app.frontendUrl}${this.config.app.emailVerificationPath}?token=${input.verificationToken}&type=new-user`;

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
