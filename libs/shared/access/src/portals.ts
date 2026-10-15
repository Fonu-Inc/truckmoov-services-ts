import { NotFoundException, SetMetadata } from "@nestjs/common";
import type { Portal } from "@shared/identity";

/** Who a route serves. */
export type Audience = Portal | "service" | "public";

export const PORTALS_KEY = "truckmoov:portals";

/**
 * Declares who may reach a route. Every route declares it, on the method or
 * its controller; one that does not is refused.
 */
export const Portals = (...audiences: Audience[]) => SetMetadata(PORTALS_KEY, audiences);

export type RequestLike = {
  method: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
};

/** Exactly what the router answers for a path it does not know. */
export function routeNotFound(req: RequestLike): NotFoundException {
  return new NotFoundException(`Cannot ${req.method} ${req.originalUrl ?? req.url ?? ""}`);
}

/** A caller that presented a token which did not verify, most often an expired one. */
export type Caller = Audience | "unverified";

export type Refusal = {
  method: string;
  path: string;
  ip: string;
  caller: Caller;
  reason: "undeclared_route" | "audience_not_served" | "forbidden" | "undeclared_permission" | "missing_permission";
};

/** Who is calling, as far as the request proves. */
export interface CallerAudienceResolver {
  resolve(req: RequestLike): Promise<Caller>;
}

/** Passes refusals on to the platform's IP blocking. Must not throw. */
export interface RefusalReporter {
  report(refusal: Refusal): void;
}

export const CALLER_AUDIENCE = Symbol("CALLER_AUDIENCE");
export const REFUSAL_REPORTER = Symbol("REFUSAL_REPORTER");
export const PORTAL_ENFORCEMENT = Symbol("PORTAL_ENFORCEMENT");

/** Express resolves req.ip through the configured trust proxy; raw X-Forwarded-For is caller-controlled. */
export function clientIp(req: RequestLike): string {
  return req.ip || "";
}
