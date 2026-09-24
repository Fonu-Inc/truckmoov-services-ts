import { describe, expect, it, vi } from 'vitest';
import { ActivityLogService } from '../../../apps/auth/src/activity-log.service';
import { InMemoryActivityLogRepository } from '../../../apps/auth/src/in-memory-activity-log.repository';
import type { RecordActivityCommand } from '../../../apps/auth/src/activity-log.service';

function build(findById: (id: string) => Promise<unknown> = async () => ({
  id: 'usr-1',
  email: 'adaeze.okafor@mtn.ng',
  profile: { fullName: 'Adaeze Okafor' },
})) {
  const repository = new InMemoryActivityLogRepository();
  const users = { findById: vi.fn(findById) };
  const tenants = { organizationNameFor: vi.fn(async () => 'Lagos Express Logistics') };
  const service = new ActivityLogService(
    repository,
    { get: async () => ({ security: { auditLogging: true } }) } as never,
    tenants,
    {} as never,
    users as never,
  );
  return { service, repository, users, tenants };
}

function command(overrides: Partial<RecordActivityCommand> = {}): RecordActivityCommand {
  return {
    tenantId: 'tenant-1',
    service: 'fleet',
    action: 'vehicle.created',
    entityType: 'vehicle',
    entityId: 'veh-1',
    summary: 'Vehicle created',
    actorId: 'usr-1',
    actorRole: 'FLEET_ADMIN',
    ...overrides,
  };
}

async function stored(repository: InMemoryActivityLogRepository) {
  return (await repository.queryAcrossTenants({}))[0];
}

describe('Audit name snapshots', () => {
  // Fleet and Go events, and direct auth writes, carry only the actor id.
  it('resolves the actor and tenant names when the writer passes only ids', async () => {
    const { service, repository } = build();
    await service.record(command());

    expect(await stored(repository)).toMatchObject({
      actorName: 'Adaeze Okafor',
      actorEmail: 'adaeze.okafor@mtn.ng',
      tenantName: 'Lagos Express Logistics',
    });
  });

  it('keeps names the writer already gave', async () => {
    const { service, repository, users, tenants } = build();
    await service.record(
      command({ actorName: 'Given', actorEmail: 'given@x.ng', tenantName: 'Given Co' }),
    );

    expect(await stored(repository)).toMatchObject({
      actorName: 'Given',
      actorEmail: 'given@x.ng',
      tenantName: 'Given Co',
    });
    expect(users.findById).not.toHaveBeenCalled();
    expect(tenants.organizationNameFor).not.toHaveBeenCalled();
  });

  it('labels the platform tenant rather than looking it up', async () => {
    const { service, repository, tenants } = build();
    await service.record(command({ tenantId: 'system' }));

    expect((await stored(repository)).tenantName).toBe('System / Platform');
    expect(tenants.organizationNameFor).not.toHaveBeenCalled();
  });

  it('looks no one up for a system or missing actor', async () => {
    const { service, users } = build();
    await service.record(command({ actorId: 'system' }));
    await service.record(command({ actorId: '' }));

    expect(users.findById).not.toHaveBeenCalled();
  });

  it('caches the actor lookup between writes', async () => {
    const { service, users } = build();
    await service.record(command());
    await service.record(command());

    expect(users.findById).toHaveBeenCalledOnce();
  });

  it('still writes the entry when the actor lookup fails', async () => {
    const { service, repository } = build(async () => {
      throw new Error('database unavailable');
    });
    await service.record(command());

    expect(await stored(repository)).toMatchObject({ actorName: null, actorEmail: null });
  });
});
