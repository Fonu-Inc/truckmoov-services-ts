export type InviteEmail = {
  email: string;
  role: string;
  inviteToken: string;
};

export type PasswordResetEmail = {
  email: string;
  resetToken: string;
};

export interface AuthNotifier {
  sendInviteEmail(input: InviteEmail): Promise<void>;
  sendPasswordResetEmail(input: PasswordResetEmail): Promise<void>;
}

export const AUTH_NOTIFIER = Symbol("AUTH_NOTIFIER");
