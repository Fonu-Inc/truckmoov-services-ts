import type { AuthUser } from "../entities/auth-user.entity";

export interface IdentityProvider {
  verifyCredentials(email: string, password: string): Promise<AuthUser>;
}

export const IDENTITY_PROVIDER = Symbol("IDENTITY_PROVIDER");
