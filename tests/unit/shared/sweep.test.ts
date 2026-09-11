import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { sweepSafely } from '@shared/observability';

function logger() {
  const error = vi.fn();
  return { error } as unknown as Logger & { error: ReturnType<typeof vi.fn> };
}

describe('Background sweeps', () => {
  // A timer callback returning an un-awaited promise turns any escaping
  // failure into an unhandled rejection, which reads as a crash rather than
  // one tick that did not run.
  it('swallows and logs a failing sweep', async () => {
    const log = logger();
    const rejections: unknown[] = [];
    const capture = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', capture);

    sweepSafely(log, 'mailbox_sync', async () => {
      throw new Error('Knex: Timeout acquiring a connection');
    });
    await new Promise((resolve) => setImmediate(resolve));

    process.off('unhandledRejection', capture);
    expect(rejections).toEqual([]);
    expect(log.error).toHaveBeenCalledWith(
      'mailbox_sync_sweep_failed:Knex: Timeout acquiring a connection',
    );
  });

  it('says something useful when the failure is not an Error', async () => {
    const log = logger();
    sweepSafely(log, 'storage_reconciliation', async () => {
      throw 'nope';
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(log.error).toHaveBeenCalledWith('storage_reconciliation_sweep_failed:unknown');
  });

  it('stays quiet when the sweep succeeds', async () => {
    const log = logger();
    sweepSafely(log, 'sim_recurring_charge', async () => ({ tenants: 3 }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(log.error).not.toHaveBeenCalled();
  });
});
