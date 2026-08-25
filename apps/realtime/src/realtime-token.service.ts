import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '@shared/config';

export type RealtimePrincipal = {
  userId: string;
  tenantId: string;
  role: string;
};

type AccessTokenPayload = {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
  exp: number;
};

/**
 * Verifies the access token a socket presents.
 *
 * Same HMAC scheme as the fleet service uses, deliberately: one token format
 * across the platform means one place to change when it rotates.
 */
@Injectable()
export class RealtimeTokenService {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  verify(token: string | undefined): RealtimePrincipal | null {
    if (!token) return null;

    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;

    const expected = createHmac('sha256', this.config.auth.jwtSecret)
      .update(encoded)
      .digest('base64url');
    const provided = Buffer.from(signature, 'utf8');
    const computed = Buffer.from(expected, 'utf8');
    // Length first: timingSafeEqual throws on a mismatch, and the length is
    // not the secret.
    if (provided.length !== computed.length) return null;
    if (!timingSafeEqual(provided, computed)) return null;

    let payload: AccessTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    } catch {
      return null;
    }

    if (!payload.tenantId || !payload.sub) return null;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;

    return { userId: payload.sub, tenantId: payload.tenantId, role: payload.role };
  }
}
