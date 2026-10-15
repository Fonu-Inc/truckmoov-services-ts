export type StoredPasswordReset = {
  id: string;
  userId: string;
  token: string;
  method: "email" | "sms";
  code: string | null;
  used: boolean;
  expiresAt: Date;
  createdAt: Date;
};

export interface PasswordResetStore {
  save(reset: StoredPasswordReset): Promise<void>;
  findByToken(token: string): Promise<StoredPasswordReset | null>;
  findByUserIdAndCode(userId: string, code: string): Promise<StoredPasswordReset | null>;
  /** Spends every outstanding reset of the user, not only the one presented. */
  markUsedForUser(userId: string): Promise<void>;
}

export const PASSWORD_RESET_STORE = Symbol("PASSWORD_RESET_STORE");
