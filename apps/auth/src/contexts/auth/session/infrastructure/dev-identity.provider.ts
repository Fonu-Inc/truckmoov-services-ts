import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AuthUser } from "../domain/entities/auth-user.entity";
import { InvalidCredentialsError } from "../domain/errors/invalid-credentials.error";
import type { IdentityProvider } from "../domain/ports/identity-provider.port";

@Injectable()
export class DevIdentityProvider implements IdentityProvider {
  async verifyCredentials(email: string, password: string) {
    if (!email.trim() || !password.trim()) {
      throw new InvalidCredentialsError();
    }

    return AuthUser.create({
      id: randomUUID(),
      email,
      role: "admin",
      tenantId: "dev-tenant",
    });
  }
}
