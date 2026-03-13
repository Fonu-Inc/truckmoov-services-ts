import { Injectable } from "@nestjs/common";
import type { PasswordHasher } from "@auth/session/domain/ports/password-hasher.port";
import { hashPassword, verifyPassword } from "./password";

@Injectable()
export class ScryptPasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hashPassword(password);
  }

  verify(password: string, stored: string): Promise<boolean> {
    return verifyPassword(password, stored);
  }
}
