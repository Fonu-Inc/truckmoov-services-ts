import { describe, expect, it } from 'vitest';
import { ListMisplacedSystemAccountsUseCase } from '../../../apps/auth/src/list-misplaced-system-accounts.use-case';
import { InMemoryUserRepository } from '../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-user.repository';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';

async function build(actor: { role: string; tenantId: string }) {
  const users = new InMemoryUserRepository();
  const seed = [
    { id: 'actor', role: actor.role, tenantId: actor.tenantId },
    { id: 'staff', role: 'PLATFORM_ADMIN', tenantId: 'system' },
    { id: 'misplaced', role: 'PLATFORM_ADMIN', tenantId: 'tenant-a' },
    { id: 'tenant-user', role: 'FLEET_ADMIN', tenantId: 'tenant-a' },
  ];
  for (const user of seed) {
    await users.save({ ...user, email: `${user.id}@co.com`, passwordHash: 'x' });
  }
  const useCase = new ListMisplacedSystemAccountsUseCase(
    { resolveAccessToken: () => ({ id: 'actor' }) } as never,
    users,
  );
  return { useCase, users };
}

describe('listing system roles held outside the system tenant', () => {
  it('lists only the misplaced accounts', async () => {
    const { useCase } = await build({ role: 'SYSTEM_ADMIN', tenantId: 'system' });

    const result = await useCase.execute('token');

    expect(result.data.accounts.map((account) => account.id)).toEqual(['misplaced']);
  });

  it('changes nothing', async () => {
    const { useCase, users } = await build({ role: 'SYSTEM_ADMIN', tenantId: 'system' });

    await useCase.execute('token');

    const misplaced = await users.findById('misplaced');
    expect(misplaced?.role).toBe('PLATFORM_ADMIN');
    expect(misplaced?.accountStatus).toBe('enabled');
  });

  it('refuses anyone outside the system tenant', async () => {
    const { useCase } = await build({ role: 'SYSTEM_ADMIN', tenantId: 'tenant-a' });

    await expect(useCase.execute('token')).rejects.toBeInstanceOf(ForbiddenError);
  });
});
