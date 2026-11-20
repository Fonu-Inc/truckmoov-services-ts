import { describe, expect, it, vi } from 'vitest';
import {
  assertTerminationRequest,
  TenantTerminationError,
} from '../../../apps/auth/src/tenant-termination.repository';
import { InMemoryTenantTerminationRepository } from '../../../apps/auth/src/mikro-tenant-termination.repository';
import {
  TenantAlreadyTerminatedError,
  TerminateSystemTenantUseCase,
} from '../../../apps/auth/src/terminate-system-tenant.use-case';

const TOKEN = 'system-token';
const REASON = 'Contract ended and the customer asked to be closed';

function build(options: { role?: string; sims?: Array<Record<string, unknown>> } = {}) {
  const terminations = new InMemoryTenantTerminationRepository();
  const updateAccountStatus = vi.fn(async () => {});
  const deleteAllForUser = vi.fn(async () => {});
  const saveSim = vi.fn(async () => {});
  const publish = vi.fn(async () => {});
  const record = vi.fn(async () => ({}) as never);

  const useCase = new TerminateSystemTenantUseCase(
    { resolveAccessToken: () => ({ id: 'sys1' }) } as never,
    {
      findById: async () => ({
        id: 'sys1',
        email: 'admin@system',
        passwordHash: 'x',
        role: options.role ?? 'SYSTEM_ADMIN',
        tenantId: 'system',
        accountStatus: 'enabled',
      }),
      findAllByTenant: async () => [{ id: 'u1' }, { id: 'u2' }],
      updateAccountStatus,
    } as never,
    { deleteAllForUser } as never,
    {
      findAll: async () => ({
        items: options.sims ?? [
          { id: 's1', status: 'active' },
          { id: 's2', status: 'deactivated' },
        ],
        total: 2,
      }),
      save: saveSim,
    } as never,
    terminations,
    { record } as never,
    { publish } as never,
  );

  return { useCase, terminations, updateAccountStatus, deleteAllForUser, saveSim, publish, record };
}

describe('Termination request gates', () => {
  it('accepts a reason of at least ten characters with the confirmation', () => {
    expect(assertTerminationRequest({ reason: REASON, confirmation: 'TERMINATE' })).toBe(REASON);
  });

  it('refuses a short or blank reason', () => {
    for (const reason of ['', '   ', 'too short']) {
      expect(() => assertTerminationRequest({ reason, confirmation: 'TERMINATE' })).toThrow(
        TenantTerminationError,
      );
    }
  });

  // Checked server-side because a client that skips the dialog must not be
  // able to skip the intent it establishes.
  it('refuses without the exact confirmation word', () => {
    for (const confirmation of ['', 'terminate', 'TERMINATE ', 'yes']) {
      expect(() => assertTerminationRequest({ reason: REASON, confirmation })).toThrow(
        /Type TERMINATE/,
      );
    }
  });
});

describe('Terminating a tenant', () => {
  it('disables users, revokes their sessions and deactivates SIMs', async () => {
    const kit = build();
    const result = await kit.useCase.execute({
      accessToken: TOKEN,
      tenantId: 'tenant-1',
      reason: REASON,
      confirmation: 'TERMINATE',
    });

    expect(kit.updateAccountStatus).toHaveBeenCalledTimes(2);
    // Revoked rather than left to expire: a termination that leaves a live
    // session behind has ended nothing for whoever holds it.
    expect(kit.deleteAllForUser).toHaveBeenCalledTimes(2);
    // Only the one that was not already deactivated.
    expect(kit.saveSim).toHaveBeenCalledTimes(1);
    expect(result.data).toMatchObject({ usersDisabled: 2, simsDeactivated: 1 });
  });

  it('records the reason, which is the point of the record', async () => {
    const kit = build();
    await kit.useCase.execute({
      accessToken: TOKEN,
      tenantId: 'tenant-1',
      reason: `  ${REASON}  `,
      confirmation: 'TERMINATE',
    });

    const stored = await kit.terminations.findByTenantId('tenant-1');
    expect(stored).toMatchObject({ reason: REASON, terminatedBy: 'sys1' });
    expect(kit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.terminated',
        metadata: expect.objectContaining({ reason: REASON }),
      }),
    );
  });

  it('announces the termination so other services stop honouring its tokens', async () => {
    const kit = build();
    await kit.useCase.execute({
      accessToken: TOKEN,
      tenantId: 'tenant-1',
      reason: REASON,
      confirmation: 'TERMINATE',
    });

    expect(kit.publish).toHaveBeenCalledWith(
      'tm.tenant-1.tenant.terminated',
      expect.objectContaining({ type: 'tenant.terminated' }),
    );
  });

  // Terminal by design. There is no reinstate.
  it('refuses to terminate the same tenant twice', async () => {
    const kit = build();
    const command = {
      accessToken: TOKEN,
      tenantId: 'tenant-1',
      reason: REASON,
      confirmation: 'TERMINATE',
    };

    await kit.useCase.execute(command);
    await expect(kit.useCase.execute(command)).rejects.toBeInstanceOf(
      TenantAlreadyTerminatedError,
    );
  });

  it('refuses to terminate the platform tenant', async () => {
    const kit = build();
    await expect(
      kit.useCase.execute({
        accessToken: TOKEN,
        tenantId: 'system',
        reason: REASON,
        confirmation: 'TERMINATE',
      }),
    ).rejects.toThrow(/platform tenant/);
  });

  it('refuses a caller who is not a system admin', async () => {
    const kit = build({ role: 'OWNER_OPERATOR' });
    await expect(
      kit.useCase.execute({
        accessToken: TOKEN,
        tenantId: 'tenant-1',
        reason: REASON,
        confirmation: 'TERMINATE',
      }),
    ).rejects.toThrow(/Only system admins/);
  });

  // The termination is already written by then; a failed announcement must not
  // undo it.
  it('still terminates when the announcement cannot be published', async () => {
    const terminations = new InMemoryTenantTerminationRepository();
    const useCase = new TerminateSystemTenantUseCase(
      { resolveAccessToken: () => ({ id: 'sys1' }) } as never,
      {
        findById: async () => ({
          id: 'sys1',
          email: 'a@b',
          passwordHash: 'x',
          role: 'SYSTEM_ADMIN',
          tenantId: 'system',
          accountStatus: 'enabled',
        }),
        findAllByTenant: async () => [],
        updateAccountStatus: async () => {},
      } as never,
      { deleteAllForUser: async () => {} } as never,
      { findAll: async () => ({ items: [], total: 0 }), save: async () => {} } as never,
      terminations,
      { record: async () => ({}) as never } as never,
      {
        publish: async () => {
          throw new Error('nats unavailable');
        },
      } as never,
    );

    await expect(
      useCase.execute({
        accessToken: TOKEN,
        tenantId: 'tenant-1',
        reason: REASON,
        confirmation: 'TERMINATE',
      }),
    ).resolves.toMatchObject({ status: true });
    expect(await terminations.findByTenantId('tenant-1')).not.toBeNull();
  });
});
