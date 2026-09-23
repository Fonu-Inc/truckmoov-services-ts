import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppConfigService } from "@shared/config";
import { UserTokenSigner, UserTokenVerifier } from "@shared/identity";
import type { TokenService } from "../domain/ports/token-service.port";
import { AuthUser } from "../domain/entities/auth-user.entity";

@Injectable()
export class UserTokenService implements TokenService {
  private static readonly ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
  private readonly logger = new Logger(UserTokenService.name);
  private readonly signer: UserTokenSigner;
  private readonly verifier: UserTokenVerifier;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    const { signingKey, publicKeys, legacySecret } = config.identity;
    this.signer = new UserTokenSigner(signingKey, config.auth.jwtSecret);
    this.verifier = new UserTokenVerifier(publicKeys, legacySecret);
    if (!this.signer.signsWithPrivateKey) {
      this.logger.warn("user_tokens_unsigned: USER_TOKEN_SIGNING_KEY is not set, issuing shared-secret tokens");
    }
  }

  issueAccessToken(user: AuthUser): string {
    return this.signer.sign(user.toPrimitives(), UserTokenService.ACCESS_TOKEN_TTL_SECONDS);
  }

  issueRefreshToken(_user: AuthUser): string {
    return `dev-refresh-${randomUUID()}`;
  }

  resolveAccessToken(token: string): AuthUser | null {
    const claims = this.verifier.verify(token);
    if (!claims) return null;
    return AuthUser.create({ id: claims.sub, email: claims.email, role: claims.role, tenantId: claims.tenantId });
  }

  revokeAccessToken(_token: string): void {}
}
