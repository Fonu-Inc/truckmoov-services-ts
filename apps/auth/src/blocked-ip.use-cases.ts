import { Inject, Injectable } from '@nestjs/common';
import { ID_GENERATOR, TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { IdGenerator } from './contexts/auth/session/domain/ports/id-generator.port';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  BLOCKED_IP_REPOSITORY,
  type BlockedIpFilters,
  type BlockedIpRepository,
} from './blocked-ip.repository';
import {
  SECURITY_EVENT_REPOSITORY,
  type SecurityEventRepository,
} from './security-event.repository';

export class BlockedIpNotFoundError extends Error {}
export class BlockedIpAlreadyUnblockedError extends Error {}

@Injectable()
export class ListBlockedIpsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BLOCKED_IP_REPOSITORY) private readonly blockedIps: BlockedIpRepository,
  ) {}

  async execute(accessToken: string, filters: BlockedIpFilters) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view blocked IPs',
    });
    const page = await this.blockedIps.search(filters);
    return { status: true, message: 'Blocked IPs retrieved', data: page };
  }
}

@Injectable()
export class ManuallyBlockIpUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BLOCKED_IP_REPOSITORY) private readonly blockedIps: BlockedIpRepository,
    @Inject(SECURITY_EVENT_REPOSITORY) private readonly securityEvents: SecurityEventRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(accessToken: string, ipAddress: string, reason: string, expiresAt: Date | null) {
    const actor = await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to block IPs',
    });
    const now = new Date();
    const record = {
      id: this.idGenerator.generate(),
      ipAddress,
      reason,
      blockType: expiresAt ? ('temporary' as const) : ('permanent' as const),
      blockedAt: now,
      expiresAt,
      blockedBy: actor.id,
      unblockedAt: null,
      unblockedBy: null,
    };
    await this.blockedIps.save(record);
    await this.securityEvents.save({
      id: this.idGenerator.generate(),
      eventType: 'ip_manually_blocked',
      severity: 'medium',
      tenantId: null,
      summary: `IP ${ipAddress} manually blocked`,
      relatedEntityType: 'blocked_ip',
      relatedEntityId: ipAddress,
      metadata: { blockedBy: actor.id, reason },
      occurredAt: now,
    });
    return { status: true, message: 'IP blocked', data: record };
  }
}

@Injectable()
export class UnblockIpUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(BLOCKED_IP_REPOSITORY) private readonly blockedIps: BlockedIpRepository,
  ) {}

  async execute(accessToken: string, id: string) {
    const actor = await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to unblock IPs',
    });
    const block = await this.blockedIps.findById(id);
    if (!block) throw new BlockedIpNotFoundError('Blocked IP not found');
    if (block.unblockedAt) throw new BlockedIpAlreadyUnblockedError('This IP is already unblocked');

    const updated = { ...block, unblockedAt: new Date(), unblockedBy: actor.id };
    await this.blockedIps.save(updated);
    return { status: true, message: 'IP unblocked', data: updated };
  }
}
