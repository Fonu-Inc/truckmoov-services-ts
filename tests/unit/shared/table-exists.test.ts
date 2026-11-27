import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTableExistsCache, tableExists } from '@shared/db';

describe('tableExists', () => {
  beforeEach(() => resetTableExistsCache());

  it('re-queries while the table is missing, then stops once it exists', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{ exists: false }])
      .mockResolvedValue([{ exists: 't' }]);

    expect(await tableExists({ execute }, 'fleet_devices')).toBe(false);
    expect(await tableExists({ execute }, 'fleet_devices')).toBe(true);
    expect(await tableExists({ execute }, 'fleet_devices')).toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('caches per table name', async () => {
    const execute = vi.fn().mockResolvedValue([{ exists: true }]);

    await tableExists({ execute }, 'fleet_devices');
    await tableExists({ execute }, 'fleet_drivers');

    expect(execute).toHaveBeenCalledTimes(2);
  });
});
