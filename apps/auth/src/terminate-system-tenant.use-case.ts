import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';
import { ActivityLogService } from './activity-log.service';
import { ForbiddenError, TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import { SESSION_STORE, type SessionStore } from './contexts/auth/session/domain/ports/session-store.port';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { SYSTEM_MUTATOR_ROLES } from './system-authz';
import {
  assertTerminationRequest,
  TenantTerminationError,
  TENANT_TERMINATION_REPOSITORY,
  type TenantTerminationRepository,
} from './tenant-termination.repository';
import { SYSTEM_TENANT_ID } from '@shared/identity';


export class TenantAlreadyTerminatedError extends Error {
  constructor() {
    super('This tenant has already been terminated');
  }
}

export type TerminateSystemTenantCommand = {
  accessToken: string;
  tenantId: string;
  reason: string;
  confirmation: string;
};

/**
 * Ends a tenant permanently.
 *
 * Terminal by design: there is no reinstate, and the status is stored rather
 * than derived because a terminated tenant and a suspended one look identical
 * from the outside — every user disabled.
 *
 * Deliberately narrower than the confirmation dialog once described. SIMs are
 * deactivated in this platform only; there is no HLR integration, so the
 * carrier is not told. WhatsApp numbers are not retired, no data export is
 * generated, and nothing is purged on a schedule. None of those exist yet, and
 * a termination that silently skips four of the five things it promised is
 * worse than one that promises less.
 */
@Injectable()
export class TerminateSystemTenantUseCase {
  private readonly logger = new Logger(TerminateSystemTenantUseCase.name);

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(SIM_REPOSITORY) private readonly sims: SimRepository,
    @Inject(TENANT_TERMINATION_REPOSITORY)
    private readonly terminations: TenantTerminationRepository,
    @Inject(ActivityLogService) private readonly activity: ActivityLogService,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {}

  async execute(command: TerminateSystemTenantCommand) {
    const actor = await resolveActorUser(command.accessToken, this.tokenService, this.users);
    if (actor.tenantId !== SYSTEM_TENANT_ID || !SYSTEM_MUTATOR_ROLES.has(actor.role)) {
      throw new ForbiddenError('Only system admins can terminate tenants');
    }
    if (command.tenantId === SYSTEM_TENANT_ID) {
      throw new TenantTerminationError('The platform tenant cannot be terminated');
    }

    const reason = assertTerminationRequest(command);

    const existing = await this.terminations.findByTenantId(command.tenantId);
    if (existing) throw new TenantAlreadyTerminatedError();

    const usersDisabled = await this.disableUsers(command.tenantId);
    const simsDeactivated = await this.deactivateSims(command.tenantId);

    // Written after the work, carrying what was actually done rather than what
    // was intended, so the record cannot overstate the outcome.
    await this.terminations.save({
      tenantId: command.tenantId,
      reason,
      terminatedBy: actor.id,
      terminatedAt: new Date(),
      simsDeactivated,
      usersDisabled,
    });

    await this.announce(command.tenantId, actor.id);
    await this.recordActivity(command.tenantId, actor, reason, usersDisabled, simsDeactivated);

    return {
      status: true,
      message: 'Tenant terminated',
      data: {
        tenantId: command.tenantId,
        terminatedAt: new Date().toISOString(),
        usersDisabled,
        simsDeactivated,
        reason,
      },
    };
  }

  private async disableUsers(tenantId: string): Promise<number> {
    const users = await this.users.findAllByTenant(tenantId);
    for (const user of users) {
      await this.users.updateAccountStatus(user.id, 'disabled');
      // Revoked rather than left to expire: a termination that leaves a live
      // session behind has not ended anything for the person holding it.
      await this.sessions.deleteAllForUser(user.id);
    }
    return users.length;
  }

  /**
   * Deactivates the tenant's SIMs on this platform.
   *
   * Internal only. Nothing here reaches the carrier, so a deactivated SIM may
   * still be live on the network and still billing.
   */
  private async deactivateSims(tenantId: string): Promise<number> {
    const { items } = await this.sims.findAll({ tenantId });
    let deactivated = 0;

    for (const sim of items) {
      if (sim.status === 'deactivated') continue;
      await this.sims.save({ ...sim, status: 'deactivated', updatedAt: new Date() });
      deactivated += 1;
    }
    return deactivated;
  }

  private async announce(tenantId: string, actorId: string): Promise<void> {
    try {
      await this.bus.publish(`tm.${tenantId}.tenant.terminated`, {
        id: randomUUID(),
        type: 'tenant.terminated',
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: tenantId,
        actor: { id: actorId },
        data: { tenant_id: tenantId, status: 'terminated' },
      });
    } catch (error) {
      // The termination is already written. This only speeds up its reach to
      // services that verify tokens locally.
      this.logger.warn(
        `tenant_terminated_publish_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  private async recordActivity(
    tenantId: string,
    actor: { id: string; role: string },
    reason: string,
    usersDisabled: number,
    simsDeactivated: number,
  ): Promise<void> {
    try {
      await this.activity.record({
        tenantId,
        service: 'auth',
        action: 'tenant.terminated',
        entityType: 'tenant',
        entityId: tenantId,
        summary: 'Tenant terminated',
        actorId: actor.id,
        actorRole: actor.role,
        // The reason is the point of the record. It is what an auditor reads.
        metadata: { reason, usersDisabled, simsDeactivated },
      });
    } catch (error) {
      this.logger.warn(
        `tenant_terminated_audit_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }
}
