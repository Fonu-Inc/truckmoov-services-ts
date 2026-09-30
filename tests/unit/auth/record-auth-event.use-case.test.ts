import { describe, expect, it } from 'vitest';
import { RecordAuthEventUseCase } from '../../../apps/auth/src/record-auth-event.use-case';
import { InMemoryAuthEventRepository } from '../../../apps/auth/src/in-memory-auth-event.repository';
import { InMemoryBlockedIpRepository } from '../../../apps/auth/src/in-memory-blocked-ip.repository';
import { InMemoryAutoBlockRuleRepository } from '../../../apps/auth/src/in-memory-auto-block-rule.repository';
import { InMemorySecurityEventRepository } from '../../../apps/auth/src/in-memory-security-event.repository';
import { PlatformAlertPublisher } from '../../../apps/auth/src/platform-alert.publisher';

function harness() {
  const authEvents = new InMemoryAuthEventRepository();
  const blockedIps = new InMemoryBlockedIpRepository();
  const rules = new InMemoryAutoBlockRuleRepository();
  const securityEvents = new InMemorySecurityEventRepository();
  let idCounter = 0;
  const idGenerator = { generate: () => `id-${++idCounter}` };
  const raised: unknown[] = [];
  const alerts = { raise: async (alert: unknown) => { raised.push(alert); } } as unknown as PlatformAlertPublisher;

  const useCase = new RecordAuthEventUseCase(
    authEvents,
    rules,
    blockedIps,
    securityEvents,
    idGenerator,
    alerts,
  );

  return { useCase, authEvents, blockedIps, rules, securityEvents, raised };
}

describe('RecordAuthEventUseCase', () => {
  it('records a successful login without touching auto-block', async () => {
    const { useCase, authEvents, blockedIps } = harness();
    await useCase.execute({
      tenantId: 'tenant-a', userId: 'user-1', email: 'a@x.com',
      eventType: 'login', status: 'success', ipAddress: '1.2.3.4', userAgent: null,
    });
    const page = await authEvents.search({});
    expect(page.total).toBe(1);
    expect(await blockedIps.findActiveByIp('1.2.3.4')).toBeNull();
  });

  it('auto-blocks an IP once the strictest enabled rule threshold is met', async () => {
    const { useCase, blockedIps, securityEvents, raised } = harness();
    for (let i = 0; i < 3; i++) {
      await useCase.execute({
        tenantId: null, userId: null, email: 'a@x.com',
        eventType: 'login', status: 'failed', failureReason: 'invalid_password',
        ipAddress: '9.9.9.9', userAgent: null,
      });
    }
    const block = await blockedIps.findActiveByIp('9.9.9.9');
    expect(block).not.toBeNull();
    expect(block?.blockedBy).toBe('system:auto-block');
    expect(block?.blockType).toBe('temporary');

    const events = await securityEvents.search({});
    expect(events.items[0]?.eventType).toBe('ip_auto_blocked');
    expect(raised).toHaveLength(1);
  });

  it('records wrong second-factor codes without counting them toward the IP block', async () => {
    const { useCase, authEvents, blockedIps } = harness();
    for (let i = 0; i < 6; i++) {
      await useCase.execute({
        tenantId: null, userId: null, email: 'a@x.com',
        eventType: 'login', status: 'failed', failureReason: 'mfa_failed',
        ipAddress: '7.7.7.7', userAgent: null,
      });
    }
    expect((await authEvents.search({})).total).toBe(6);
    expect(await authEvents.countFailuresFromIp('7.7.7.7', new Date(0))).toBe(0);
    expect(await blockedIps.findActiveByIp('7.7.7.7')).toBeNull();
  });

  it('does not re-block an IP that already has an active block', async () => {
    const { useCase, blockedIps } = harness();
    for (let i = 0; i < 3; i++) {
      await useCase.execute({
        tenantId: null, userId: null, email: null,
        eventType: 'login', status: 'failed', failureReason: 'invalid_password',
        ipAddress: '5.5.5.5', userAgent: null,
      });
    }
    const first = await blockedIps.findActiveByIp('5.5.5.5');

    for (let i = 0; i < 3; i++) {
      await useCase.execute({
        tenantId: null, userId: null, email: null,
        eventType: 'login', status: 'failed', failureReason: 'invalid_password',
        ipAddress: '5.5.5.5', userAgent: null,
      });
    }
    const still = await blockedIps.findActiveByIp('5.5.5.5');
    expect(still?.id).toBe(first?.id);
  });

  it('a disabled rule never triggers, even past its threshold', async () => {
    const { useCase, rules, blockedIps } = harness();
    const aggressive = await rules.findById('aggressive_protection');
    await rules.save({ ...aggressive!, enabled: false });

    for (let i = 0; i < 3; i++) {
      await useCase.execute({
        tenantId: null, userId: null, email: null,
        eventType: 'login', status: 'failed', failureReason: 'invalid_password',
        ipAddress: '7.7.7.7', userAgent: null,
      });
    }
    expect(await blockedIps.findActiveByIp('7.7.7.7')).toBeNull();
  });

  it('does not count an audience-mismatch failure toward auto-block', async () => {
    const { useCase, blockedIps } = harness();
    for (let i = 0; i < 5; i++) {
      await useCase.execute({
        tenantId: null, userId: null, email: 'super@x.com',
        eventType: 'login', status: 'failed', failureReason: 'account_locked',
        ipAddress: '6.6.6.6', userAgent: null,
      });
    }
    expect(await blockedIps.findActiveByIp('6.6.6.6')).toBeNull();
  });

  it('does not evaluate auto-block on a failed refresh', async () => {
    const { useCase, blockedIps } = harness();
    for (let i = 0; i < 5; i++) {
      await useCase.execute({
        tenantId: null, userId: null, email: null,
        eventType: 'refresh', status: 'failed',
        ipAddress: '3.3.3.3', userAgent: null,
      });
    }
    expect(await blockedIps.findActiveByIp('3.3.3.3')).toBeNull();
  });
});
