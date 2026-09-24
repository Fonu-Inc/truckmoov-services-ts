export type InviteEmail = {
  email: string;
  role: string;
  inviteToken: string;
};

export type PasswordResetEmail = {
  email: string;
  resetToken: string;
};

export type VerificationEmail = {
  email: string;
  firstName: string;
  verificationToken: string;
};

export interface AuthNotifier {
  /**
   * Invite for somebody joining a tenant. Always resolves to the tenant app.
   * There is deliberately no shared "send an invite" method taking a base URL:
   * a use case cannot send a link to the wrong app if the method it calls only
   * knows one.
   */
  sendTenantInviteEmail(input: InviteEmail): Promise<void>;
  /** Invite for a platform administrator. Always resolves to the admin app. */
  sendPlatformInviteEmail(input: InviteEmail): Promise<void>;
  /** Invite for a field installer. Always resolves to the installer app. */
  sendInstallerInviteEmail(input: InviteEmail): Promise<void>;
  sendPasswordResetEmail(input: PasswordResetEmail): Promise<void>;
  sendVerificationEmail(input: VerificationEmail): Promise<void>;
}

export const AUTH_NOTIFIER = Symbol("AUTH_NOTIFIER");
