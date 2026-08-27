import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { IpBlockGuard } from '../../../apps/auth/src/ip-block.guard';
import { InMemoryBlockedIpRepository } from '../../../apps/auth/src/in-memory-blocked-ip.repository';

function contextWithIp(ip: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ ip }) }),
  } as never;
}

describe('IpBlockGuard', () => {
  it('allows a request from an unblocked IP', async () => {
    const guard = new IpBlockGuard(new InMemoryBlockedIpRepository());
    await expect(guard.canActivate(contextWithIp('1.1.1.1'))).resolves.toBe(true);
  });

  it('rejects a request from an actively blocked IP', async () => {
    const blockedIps = new InMemoryBlockedIpRepository();
    await blockedIps.save({
      id: 'blk-1', ipAddress: '2.2.2.2', reason: 'x', blockType: 'permanent',
      blockedAt: new Date(), expiresAt: null, blockedBy: 'system:auto-block',
      unblockedAt: null, unblockedBy: null,
    });
    const guard = new IpBlockGuard(blockedIps);
    await expect(guard.canActivate(contextWithIp('2.2.2.2'))).rejects.toBeInstanceOf(HttpException);
  });

  it('allows a request once a temporary block has expired', async () => {
    const blockedIps = new InMemoryBlockedIpRepository();
    await blockedIps.save({
      id: 'blk-1', ipAddress: '3.3.3.3', reason: 'x', blockType: 'temporary',
      blockedAt: new Date(Date.now() - 10_000), expiresAt: new Date(Date.now() - 1_000),
      blockedBy: 'system:auto-block', unblockedAt: null, unblockedBy: null,
    });
    const guard = new IpBlockGuard(blockedIps);
    await expect(guard.canActivate(contextWithIp('3.3.3.3'))).resolves.toBe(true);
  });
});
