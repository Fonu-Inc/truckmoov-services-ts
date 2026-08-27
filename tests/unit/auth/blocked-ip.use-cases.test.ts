import { describe, expect, it } from 'vitest';
import {
  BlockedIpAlreadyUnblockedError,
  BlockedIpNotFoundError,
  ListBlockedIpsUseCase,
  ManuallyBlockIpUseCase,
  UnblockIpUseCase,
} from '../../../apps/auth/src/blocked-ip.use-cases';
import { InMemoryBlockedIpRepository } from '../../../apps/auth/src/in-memory-blocked-ip.repository';
import { InMemorySecurityEventRepository } from '../../../apps/auth/src/in-memory-security-event.repository';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';

const TOKEN = 'sys-token';

function tokenService() {
  return { resolveAccessToken: () => ({ id: 'actor-1' }) as never };
}

function user(id: string, role: string, tenantId: string) {
  return { id, email: `${id}@x`, passwordHash: 'x', role, tenantId, accountStatus: 'enabled' };
}

function userRepo(actorRole = 'SYSTEM_ADMIN', actorTenant = 'system') {
  const table: Record<string, unknown> = { 'actor-1': user('actor-1', actorRole, actorTenant) };
  return { findById: async (id: string) => table[id] ?? null };
}

function idGenerator() {
  let n = 0;
  return { generate: () => `id-${++n}` };
}

describe('ManuallyBlockIpUseCase', () => {
  it('blocks an IP and records a security event', async () => {
    const blockedIps = new InMemoryBlockedIpRepository();
    const securityEvents = new InMemorySecurityEventRepository();
    const useCase = new ManuallyBlockIpUseCase(
      tokenService() as never, userRepo() as never, blockedIps, securityEvents, idGenerator(),
    );

    const result = await useCase.execute(TOKEN, '8.8.8.8', 'suspicious traffic', null);

    expect(result.data.blockType).toBe('permanent');
    expect(result.data.blockedBy).toBe('actor-1');
    expect(await blockedIps.findActiveByIp('8.8.8.8')).not.toBeNull();
    const events = await securityEvents.search({});
    expect(events.items[0]?.eventType).toBe('ip_manually_blocked');
  });

  it('refuses a caller outside the system tenant', async () => {
    const useCase = new ManuallyBlockIpUseCase(
      tokenService() as never,
      userRepo('FLEET_ADMIN', 'tenant-a') as never,
      new InMemoryBlockedIpRepository(),
      new InMemorySecurityEventRepository(),
      idGenerator(),
    );
    await expect(useCase.execute(TOKEN, '8.8.8.8', 'x', null)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('UnblockIpUseCase', () => {
  it('unblocks an active block', async () => {
    const blockedIps = new InMemoryBlockedIpRepository();
    await blockedIps.save({
      id: 'blk-1', ipAddress: '8.8.8.8', reason: 'x', blockType: 'permanent',
      blockedAt: new Date(), expiresAt: null, blockedBy: 'system:auto-block',
      unblockedAt: null, unblockedBy: null,
    });
    const useCase = new UnblockIpUseCase(tokenService() as never, userRepo() as never, blockedIps);

    const result = await useCase.execute(TOKEN, 'blk-1');

    expect(result.data.unblockedAt).not.toBeNull();
    expect(result.data.unblockedBy).toBe('actor-1');
    expect(await blockedIps.findActiveByIp('8.8.8.8')).toBeNull();
  });

  it('reports a missing block', async () => {
    const useCase = new UnblockIpUseCase(tokenService() as never, userRepo() as never, new InMemoryBlockedIpRepository());
    await expect(useCase.execute(TOKEN, 'ghost')).rejects.toBeInstanceOf(BlockedIpNotFoundError);
  });

  it('refuses to unblock an already-unblocked entry', async () => {
    const blockedIps = new InMemoryBlockedIpRepository();
    await blockedIps.save({
      id: 'blk-1', ipAddress: '8.8.8.8', reason: 'x', blockType: 'permanent',
      blockedAt: new Date(), expiresAt: null, blockedBy: 'system:auto-block',
      unblockedAt: new Date(), unblockedBy: 'actor-1',
    });
    const useCase = new UnblockIpUseCase(tokenService() as never, userRepo() as never, blockedIps);
    await expect(useCase.execute(TOKEN, 'blk-1')).rejects.toBeInstanceOf(BlockedIpAlreadyUnblockedError);
  });
});

describe('ListBlockedIpsUseCase', () => {
  it('filters to active-only blocks', async () => {
    const blockedIps = new InMemoryBlockedIpRepository();
    await blockedIps.save({
      id: 'blk-1', ipAddress: '1.1.1.1', reason: 'x', blockType: 'permanent',
      blockedAt: new Date(), expiresAt: null, blockedBy: 'system:auto-block',
      unblockedAt: new Date(), unblockedBy: 'actor-1',
    });
    await blockedIps.save({
      id: 'blk-2', ipAddress: '2.2.2.2', reason: 'x', blockType: 'permanent',
      blockedAt: new Date(), expiresAt: null, blockedBy: 'system:auto-block',
      unblockedAt: null, unblockedBy: null,
    });
    const useCase = new ListBlockedIpsUseCase(tokenService() as never, userRepo() as never, blockedIps);

    const result = await useCase.execute(TOKEN, { activeOnly: true });

    expect(result.data.items).toHaveLength(1);
    expect(result.data.items[0]?.ipAddress).toBe('2.2.2.2');
  });
});
