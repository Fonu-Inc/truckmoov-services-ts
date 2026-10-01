import { Inject, Injectable } from '@nestjs/common';
import { ActivityLogService } from './activity-log.service';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import type {
  BillingActor,
  BillingAudit,
  BillingAuditEntry,
} from '@auth/onboarding/domain/ports/billing-audit.port';

@Injectable()
export class BillingActorResolver {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async resolve(accessToken: string): Promise<BillingActor> {
    const user = await resolveActorUser(accessToken, this.tokens, this.users);
    return {
      userId: user.id,
      name: user.profile?.fullName?.trim() || user.email,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    };
  }
}

@Injectable()
export class ActivityLogBillingAudit implements BillingAudit {
  constructor(
    @Inject(ActivityLogService) private readonly activity: ActivityLogService,
  ) {}

  async record(actor: BillingActor, entry: BillingAuditEntry): Promise<void> {
    await this.activity.record({
      tenantId: actor.tenantId,
      service: 'auth',
      actorId: actor.userId,
      actorRole: actor.role,
      actorName: actor.name,
      actorEmail: actor.email,
      ...entry,
      metadata: entry.metadata as never,
    });
  }
}
