import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const PREVIEW_CHARACTERS = 4;

export class SecretCipherNotConfiguredError extends Error {
  constructor() {
    super("SECRET_ENCRYPTION_KEY is not set, so credentials cannot be stored");
  }
}

/**
 * What is safe to hold about a third-party credential.
 *
 * The ciphertext is what the database keeps. The preview is the last few
 * characters, kept in the clear so a screen can show which key is configured
 * without the value ever leaving the server.
 */
export type StoredSecret = {
  ciphertext: string;
  preview: string;
};

/**
 * Encrypts third-party credentials at rest.
 *
 * Provider credentials and callback secrets are the most sensitive values on
 * the platform. They are encrypted here, write-only through any interface, and
 * never logged. `decrypt` exists for the one case that needs it: the server
 * itself calling the provider. It is not for answering a request.
 */
@Injectable()
export class SecretCipherService {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  private key(): Buffer {
    const configured = this.config.security.secretEncryptionKey;
    if (!configured) throw new SecretCipherNotConfiguredError();
    return configured;
  }

  encrypt(plaintext: string): StoredSecret {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: [
        iv.toString("base64"),
        authTag.toString("base64"),
        ciphertext.toString("base64"),
      ].join(":"),
      preview: previewOf(plaintext),
    };
  }

  /**
   * Recovers a credential so this service can authenticate to the provider that
   * owns it. Never return the result to a caller: a masked field on a screen is
   * meaningless if the value comes back in the response.
   */
  decrypt(ciphertext: string): string {
    const [ivPart, authTagPart, bodyPart] = ciphertext.split(":");
    if (!ivPart || !authTagPart || !bodyPart) {
      throw new Error("Malformed encrypted secret");
    }

    const decipher = createDecipheriv(ALGORITHM, this.key(), Buffer.from(ivPart, "base64"));
    decipher.setAuthTag(Buffer.from(authTagPart, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(bodyPart, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  }
}

/**
 * The masked form a screen may display. Showing a suffix identifies which
 * credential is in place without revealing enough to use it.
 */
export function previewOf(plaintext: string): string {
  const trimmed = plaintext.trim();
  if (trimmed.length <= PREVIEW_CHARACTERS) return "•".repeat(8);
  return `${"•".repeat(8)}${trimmed.slice(-PREVIEW_CHARACTERS)}`;
}
