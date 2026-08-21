import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  SpendingLimitExceededError,
  SpendingLimitService,
  windowStartFor,
} from '../../../apps/auth/src/spending-limit.service';
import { InMemorySpendingLimitRepository } from '../../../apps/auth/src/in-memory-spending-limit.repository';
import type { StoredSpendingLimit } from '../../../apps/auth/src/spending-limit.repository';

function limit(overrides: Partial<StoredSpendingLimit> = {}): StoredSpendingLimit {
  return {
    tenantId: 'tenant-a',
    enabled: true,
    monthlyLimitKobo: 100_000,
    spentThisMonthKobo: 0,
    resetDayOfMonth: 1,
    alertEmail: 'ops@carrier.ng',
    notifyAtPercentages: [80, 100],
    windowStartedOn: windowStartFor(1, new Date()),
    notifiedPercentages: [],
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('windowStartFor', () => {
  it('opens this month once the reset day has passed', () => {
    expect(windowStartFor(10, new Date('2026-08-21T09:00:00Z'))).toBe('2026-08-10');
  });

  it('opens last month before the reset day', () => {
    expect(windowStartFor(25, new Date('2026-08-21T09:00:00Z'))).toBe('2026-07-25');
  });

  it('opens on the reset day itself', () => {
    expect(windowStartFor(21, new Date('2026-08-21T09:00:00Z'))).toBe('2026-08-21');
  });

  it('falls back to the last day of a short month', () => {
    expect(windowStartFor(31, new Date('2026-02-28T09:00:00Z'))).toBe('2026-02-28');
  });

  it('crosses the year boundary', () => {
    expect(windowStartFor(15, new Date('2026-01-04T09:00:00Z'))).toBe('2025-12-15');
  });

  it('uses the platform timezone, not UTC', () => {
    // 23:30 UTC on the 9th is already the 10th in Lagos (UTC+1).
    expect(windowStartFor(10, new Date('2026-08-09T23:30:00Z'))).toBe('2026-08-10');
  });
});

describe('SpendingLimitService', () => {
  let repo: InMemorySpendingLimitRepository;
  let bus: { publish: ReturnType<typeof vi.fn> };
  let service: SpendingLimitService;

  beforeEach(() => {
    repo = new InMemorySpendingLimitRepository();
    bus = { publish: vi.fn().mockResolvedValue(undefined) };
    service = new SpendingLimitService(repo, bus as never);
  });

  it('allows a spend below the cap', async () => {
    await repo.save(limit({ spentThisMonthKobo: 10_000 }));

    await expect(service.assertWithinLimit('tenant-a', 5_000)).resolves.toBeUndefined();
  });

  it('refuses a spend that would pass the cap', async () => {
    await repo.save(limit({ spentThisMonthKobo: 98_000 }));

    await expect(service.assertWithinLimit('tenant-a', 5_000)).rejects.toBeInstanceOf(
      SpendingLimitExceededError,
    );
  });

  it('allows a spend that lands exactly on the cap', async () => {
    await repo.save(limit({ spentThisMonthKobo: 95_000 }));

    await expect(service.assertWithinLimit('tenant-a', 5_000)).resolves.toBeUndefined();
  });

  it('allows anything when no limit is configured', async () => {
    await expect(service.assertWithinLimit('tenant-a', 999_999)).resolves.toBeUndefined();
  });

  it('allows anything when the limit is disabled', async () => {
    await repo.save(limit({ enabled: false, spentThisMonthKobo: 100_000 }));

    await expect(service.assertWithinLimit('tenant-a', 50_000)).resolves.toBeUndefined();
  });

  it('adds a completed spend to the window total', async () => {
    await repo.save(limit());

    await service.recordSpend('tenant-a', 30_000);

    expect((await repo.findByTenantId('tenant-a'))?.spentThisMonthKobo).toBe(30_000);
  });

  it('announces the 80 per cent threshold once', async () => {
    await repo.save(limit());

    await service.recordSpend('tenant-a', 85_000);
    await service.recordSpend('tenant-a', 1_000);

    const announced = bus.publish.mock.calls.map((c) => c[1].data.threshold_percentage);
    expect(announced).toEqual([80]);
  });

  it('announces 80 and 100 when one spend crosses both', async () => {
    await repo.save(limit());

    await service.recordSpend('tenant-a', 100_000);

    const announced = bus.publish.mock.calls.map((c) => c[1].data.threshold_percentage);
    expect(announced).toEqual([80, 100]);
  });

  it('marks the 100 per cent notice as blocking', async () => {
    await repo.save(limit());

    await service.recordSpend('tenant-a', 100_000);

    const hundred = bus.publish.mock.calls.find((c) => c[1].data.threshold_percentage === 100);
    expect(hundred?.[1].data.blocked).toBe(true);
  });

  it('resets the total when the window rolls over', async () => {
    await repo.save(limit({ spentThisMonthKobo: 90_000, windowStartedOn: '2020-01-01' }));

    await service.recordSpend('tenant-a', 1_000);

    expect((await repo.findByTenantId('tenant-a'))?.spentThisMonthKobo).toBe(1_000);
  });

  it('does not refuse a spend against a stale window total', async () => {
    await repo.save(limit({ spentThisMonthKobo: 100_000, windowStartedOn: '2020-01-01' }));

    await expect(service.assertWithinLimit('tenant-a', 50_000)).resolves.toBeUndefined();
  });

  it('announces again in a new window', async () => {
    await repo.save(
      limit({ spentThisMonthKobo: 90_000, notifiedPercentages: [80], windowStartedOn: '2020-01-01' }),
    );

    await service.recordSpend('tenant-a', 85_000);

    const announced = bus.publish.mock.calls.map((c) => c[1].data.threshold_percentage);
    expect(announced).toEqual([80]);
  });

  it('records the spend even when announcing fails', async () => {
    bus.publish.mockRejectedValue(new Error('nats down'));
    await repo.save(limit());

    await service.recordSpend('tenant-a', 85_000);

    expect((await repo.findByTenantId('tenant-a'))?.spentThisMonthKobo).toBe(85_000);
  });

  it('announces nothing when the cap is zero', async () => {
    await repo.save(limit({ monthlyLimitKobo: 0 }));

    await service.recordSpend('tenant-a', 5_000);

    expect(bus.publish).not.toHaveBeenCalled();
  });
});
