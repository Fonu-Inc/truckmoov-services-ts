import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { UserTokenVerifier, type Portal } from '@shared/identity';

export type RealtimePrincipal = {
  userId: string;
  tenantId: string;
  role: string;
  portal: Portal;
  /** Epoch seconds the token stops being valid; the socket is closed then. */
  exp: number;
};

/** Verifies the access token a socket presents, the same way every service does. */
@Injectable()
export class RealtimeTokenService {
  private readonly verifier: UserTokenVerifier;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.verifier = new UserTokenVerifier(config.identity.publicKeys, config.identity.legacySecret);
  }

  verify(token: string | undefined): RealtimePrincipal | null {
    const claims = this.verifier.verify(token);
    if (!claims) return null;
    return { userId: claims.sub, tenantId: claims.tenantId, role: claims.role, portal: claims.portal, exp: claims.exp };
  }
}
