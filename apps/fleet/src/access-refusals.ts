import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  VerifiedCallerAudience,
  predefinedRole,
  type PermissionKey,
  type PermissionSource,
  type Refusal,
  type RefusalReporter,
  type RequestLike,
} from "@shared/access";
import { AppConfigService } from "@shared/config";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { SYSTEM_TENANT_ID } from "@shared/identity";

@Injectable()
export class FleetCallerAudience extends VerifiedCallerAudience {
  constructor(@Inject(AppConfigService) config: AppConfigService) {
    super(config, "fleet");
  }
}

/** Sends refusals to auth, which keeps the per-IP record automatic blocking counts. */
@Injectable()
export class FleetRefusalReporter implements RefusalReporter {
  private readonly logger = new Logger(FleetRefusalReporter.name);

  constructor(@Inject(EVENT_BUS) private readonly bus: EventBus) {}

  report(refusal: Refusal): void {
    this.bus
      .publish("tm.system.access.refused", {
        id: randomUUID(),
        type: "access.refused",
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: SYSTEM_TENANT_ID,
        data: { service: "fleet", ...refusal },
      })
      .catch((error: Error) => this.logger.warn(`access_refused_publish_failed:${error.message}`));
  }
}

type FleetRequestUser = { role?: string; permissions?: readonly PermissionKey[] };

/**
 * The caller's permissions as auth reported them for this request. A service
 * caller, or a user when auth could not be asked, holds the bundle of the
 * role fleet grants it.
 */
@Injectable()
export class FleetPermissions implements PermissionSource {
  async permissionsOf(req: RequestLike & { user?: FleetRequestUser }): Promise<readonly PermissionKey[] | null> {
    if (!req.user) return null;
    if (req.user.permissions) return req.user.permissions;
    return predefinedRole(req.user.role ?? "")?.permissions ?? null;
  }
}
