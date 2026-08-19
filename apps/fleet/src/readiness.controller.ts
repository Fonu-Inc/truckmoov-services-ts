import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Public } from "@shared/rbac";
import { getFleetOrm } from "./contexts/fleet/shared/infrastructure/persistence/fleet-orm";

@Controller("fleet")
@Public()
export class ReadinessController {
  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  @Get("health/ready")
  async ready(): Promise<{ ready: true; checks: Record<string, string> }> {
    const checks: Record<string, string> = {};
    let ok = true;

    try {
      const orm = await getFleetOrm(this.config.db);
      await orm.em.getConnection().execute("select 1");
      checks.postgres = "up";
    } catch {
      checks.postgres = "down";
      ok = false;
    }

    const natsReady = await this.eventBus.isReady();
    checks.nats = natsReady ? "up" : "down";
    if (!natsReady) ok = false;

    if (!ok) {
      throw new ServiceUnavailableException({ ready: false, checks });
    }
    return { ready: true, checks };
  }
}
