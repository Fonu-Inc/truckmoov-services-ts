import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  AssignSystemSupportTicketUseCase,
  AssigneeNotSupportStaffError,
} from '../../../apps/auth/src/assign-system-support-ticket.use-case';
import { ForbiddenError } from '../../../apps/auth/src/contexts/auth/session';

const TOKEN = 'sys-token';

function tokenService() {
  return { resolveAccessToken: () => ({ id: 'actor-1' }) as never };
}

function user(id: string, role: string, tenantId: string) {
  return { id, email: `${id}@x`, passwordHash: 'x', role, tenantId, accountStatus: 'enabled' };
}

function userRepo(actorRole = 'SYSTEM_ADMIN', actorTenant = 'system', others: Record<string, unknown> = {}) {
  const table: Record<string, unknown> = {
    'actor-1': user('actor-1', actorRole, actorTenant),
    ...others,
  };
  return { findById: vi.fn(async (id: string) => table[id] ?? null) };
}

function ticketRepo(ticket: Record<string, unknown> | null) {
  const store = ticket ? { ...ticket } : null;
  return {
    findById: vi.fn(async () => (store ? { ...store } : null)),
    save: vi.fn(async (t: Record<string, unknown>) => {
      if (store) Object.assign(store, t);
    }),
    current: () => store,
  };
}

function buildTicket() {
  return { id: 'tkt-1', tenantId: 'tenant-a', status: 'open', assignedTo: null, updatedAt: new Date(0) };
}

describe('AssignSystemSupportTicketUseCase', () => {
  let tickets: ReturnType<typeof ticketRepo>;

  beforeEach(() => {
    tickets = ticketRepo(buildTicket());
  });

  function build(users: ReturnType<typeof userRepo>) {
    return new AssignSystemSupportTicketUseCase(tokenService() as never, users as never, tickets as never);
  }

  it('assigns a ticket to platform staff', async () => {
    const users = userRepo('SYSTEM_ADMIN', 'system', {
      'staff-9': user('staff-9', 'SYSTEM_ADMIN', 'system'),
    });

    const result = await build(users).execute(TOKEN, 'tkt-1', 'staff-9');

    expect(result.data.assignedTo).toBe('staff-9');
    expect(tickets.current()?.assignedTo).toBe('staff-9');
  });

  it('clears the assignment when given null', async () => {
    tickets = ticketRepo({ ...buildTicket(), assignedTo: 'staff-9' });
    const users = userRepo();

    const result = await build(users).execute(TOKEN, 'tkt-1', null);

    expect(result.data.assignedTo).toBeNull();
    expect(tickets.current()?.assignedTo).toBeNull();
  });

  it('treats a blank assignee as clearing the assignment', async () => {
    tickets = ticketRepo({ ...buildTicket(), assignedTo: 'staff-9' });

    const result = await build(userRepo()).execute(TOKEN, 'tkt-1', '   ');

    expect(result.data.assignedTo).toBeNull();
  });

  it('refuses to assign a tenant user', async () => {
    const users = userRepo('SYSTEM_ADMIN', 'system', {
      'tenant-user': user('tenant-user', 'OWNER_OPERATOR', 'tenant-a'),
    });

    await expect(build(users).execute(TOKEN, 'tkt-1', 'tenant-user')).rejects.toBeInstanceOf(
      AssigneeNotSupportStaffError,
    );
    expect(tickets.current()?.assignedTo).toBeNull();
  });

  it('refuses to assign a system-tenant user without a support role', async () => {
    const users = userRepo('SYSTEM_ADMIN', 'system', {
      'odd-one': user('odd-one', 'DISPATCHER', 'system'),
    });

    await expect(build(users).execute(TOKEN, 'tkt-1', 'odd-one')).rejects.toBeInstanceOf(
      AssigneeNotSupportStaffError,
    );
  });

  it('refuses an unknown assignee', async () => {
    await expect(build(userRepo()).execute(TOKEN, 'tkt-1', 'ghost')).rejects.toBeInstanceOf(
      AssigneeNotSupportStaffError,
    );
  });

  it('refuses a caller outside the system tenant', async () => {
    const users = userRepo('OWNER_OPERATOR', 'tenant-a');

    await expect(build(users).execute(TOKEN, 'tkt-1', null)).rejects.toBeInstanceOf(ForbiddenError);
    expect(tickets.save).not.toHaveBeenCalled();
  });

  it('reports a missing ticket', async () => {
    tickets = ticketRepo(null);

    await expect(build(userRepo()).execute(TOKEN, 'nope', null)).rejects.toThrow(/not found/);
  });

  it('stamps the update time', async () => {
    const users = userRepo('SYSTEM_ADMIN', 'system', {
      'staff-9': user('staff-9', 'SYSTEM_ADMIN', 'system'),
    });

    await build(users).execute(TOKEN, 'tkt-1', 'staff-9');

    expect((tickets.current()?.updatedAt as Date).getTime()).toBeGreaterThan(0);
  });
});
