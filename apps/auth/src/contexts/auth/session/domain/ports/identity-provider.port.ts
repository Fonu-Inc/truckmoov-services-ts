import type { AuthUser } from "../entities/auth-user.entity";

export interface IdentityProvider {
  verifyCredentials(username: string, password: string): Promise<AuthUser>;
}

export const IDENTITY_PROVIDER = Symbol("IDENTITY_PROVIDER");
