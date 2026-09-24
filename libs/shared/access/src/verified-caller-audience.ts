import type { AppConfigService } from "@shared/config";
import {
  SERVICE_TOKEN_HEADER,
  UserTokenVerifier,
  createServiceTokenVerifier,
  isPortal,
  type ServiceTokenVerifier,
} from "@shared/identity";
import type { Caller, CallerAudienceResolver, RequestLike } from "./portals";

type PrincipalLike = { portal?: string; service?: string };

function single(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/**
 * Who is calling, from the tokens the request carries. A principal a
 * middleware already verified is used as it is.
 */
export class VerifiedCallerAudience implements CallerAudienceResolver {
  private readonly users: UserTokenVerifier;
  private readonly services: ServiceTokenVerifier;

  constructor(config: AppConfigService, self: string) {
    this.users = new UserTokenVerifier(config.identity.publicKeys, config.identity.legacySecret);
    this.services = createServiceTokenVerifier(config, self);
  }

  async resolve(req: RequestLike & { user?: PrincipalLike }): Promise<Caller> {
    if (req.user?.service) return "service";
    const portal = req.user?.portal;
    if (isPortal(portal)) return portal;
    const serviceToken = single(req.headers[SERVICE_TOKEN_HEADER]);
    if (serviceToken && (await this.services.verify(serviceToken))) return "service";
    const authorization = single(req.headers.authorization);
    const [scheme, token] = authorization.split(" ");
    const claims = scheme?.toLowerCase() === "bearer" ? this.users.verify(token) : null;
    if (claims) return claims.portal;
    return serviceToken || authorization ? "unverified" : "public";
  }
}
