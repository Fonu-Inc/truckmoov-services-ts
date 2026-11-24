import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import {
  VerifiedCallerAudience,
  type PermissionKey,
  type PermissionSource,
  type Refusal,
  type RefusalReporter,
  type RequestLike,
} from '@shared/access';
import { AppConfigService } from '@shared/config';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';
import { RecordAuthEventUseCase } from './record-auth-event.use-case';
import { AccessResolver } from './access-resolver';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';

/** Refusals from the other services, for the same per-IP record. */
export const ACCESS_REFUSED_SUBJECT = 'tm.system.access.refused';

@Injectable()
export class AuthCallerAudience extends VerifiedCallerAudience {
  constructor(@Inject(AppConfigService) config: AppConfigService) {
    super(config, 'auth');
  }
}

/** Each refused request is logged for review; it does not count toward an IP block. */
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

/** The signed-in user's permissions as they are now. */
@Injectable()
export class AuthPermissions implements PermissionSource {
  constructor(
    @Inject(AccessResolver) private readonly resolver: AccessResolver,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
  ) {}

  async permissionsOf(req: RequestLike): Promise<readonly PermissionKey[] | null> {
    const header = req.headers.authorization;
    const [scheme, token] = (Array.isArray(header) ? header[0] : header ?? '').split(' ');
    const user = scheme?.toLowerCase() === 'bearer' && token ? this.tokens.resolveAccessToken(token) : null;
    const access = user ? await this.resolver.resolve(this.users, user.id) : null;
    return access?.active ? access.permissions : null;
  }
}
