import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { VerifiedCallerAudience, type Refusal, type RefusalReporter } from '@shared/access';
import { AppConfigService } from '@shared/config';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';
import { RecordAuthEventUseCase } from './record-auth-event.use-case';

/** Refusals from the other services, for the same per-IP record. */
export const ACCESS_REFUSED_SUBJECT = 'tm.system.access.refused';

@Injectable()
export class AuthCallerAudience extends VerifiedCallerAudience {
  constructor(@Inject(AppConfigService) config: AppConfigService) {
    super(config, 'auth');
  }
}

/** Each refused request counts toward the IP's automatic block, like a failed login. */
@Injectable()
export class AuthRefusalReporter implements RefusalReporter {
  constructor(@Inject(RecordAuthEventUseCase) private readonly events: RecordAuthEventUseCase) {}

  report(refusal: Pick<Refusal, 'ip'>): void {
    if (!refusal.ip) return;
    void this.events.execute({
      tenantId: null,
      userId: null,
      email: null,
      eventType: 'access',
      status: 'failed',
      failureReason: 'suspicious',
      ipAddress: refusal.ip,
      userAgent: null,
    });
  }
}

@Injectable()
export class AccessRefusedListener implements OnApplicationBootstrap, OnApplicationShutdown {
  private unsub?: () => Promise<void>;

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(AuthRefusalReporter) private readonly reporter: AuthRefusalReporter,
  ) {}

  async onApplicationBootstrap() {
    this.unsub = await this.bus.subscribe(
      ACCESS_REFUSED_SUBJECT,
      async (event) => {
        const ip = (event.data as { ip?: unknown }).ip;
        if (typeof ip === 'string') this.reporter.report({ ip });
      },
      'auth-access-refused',
    );
  }

  async onApplicationShutdown() {
    await this.unsub?.();
  }
}
