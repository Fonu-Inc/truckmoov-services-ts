import { describe, expect, it, vi } from 'vitest';
import { InMemoryMailboxRepository } from '../../../apps/auth/src/contexts/mailbox/in-memory-mailbox.repository';
import {
  MailboxNotConnectedError,
  MessageNotFoundError,
  UpdateMessageFlagsUseCase,
} from '../../../apps/auth/src/contexts/mailbox/update-message-flags.use-case';
import type { MailMessage } from '../../../apps/auth/src/contexts/mailbox/mailbox.domain';

const TOKEN = 'tenant-token';

function tokenService() {
  return { resolveAccessToken: () => ({ id: 'actor-1' }) as never };
}

function userRepo(tenantId = 'tenant-a') {
  const table: Record<string, unknown> = {
    'actor-1': { id: 'actor-1', email: 'a@x', passwordHash: 'x', role: 'FLEET_ADMIN', tenantId, accountStatus: 'enabled' },
  };
  return { findById: async (id: string) => table[id] ?? null };
}

function credentials(connected = true) {
  return {
    findByTenant: vi.fn(async () =>
      connected
        ? {
            tenantId: 'tenant-a',
            emailAddress: 'ops@tenant.com',
            displayName: null,
            imap: { host: 'imap.x.com', port: 993, username: 'u', secure: true, passwordCiphertext: 'c', passwordPreview: 'p' },
            smtp: { host: 'smtp.x.com', port: 587, username: 'u', secure: true, passwordCiphertext: 'c', passwordPreview: 'p' },
            lastVerifiedAt: null,
            lastError: null,
            updatedAt: '2026-08-24T10:00:00.000Z',
          }
        : null,
    ),
  } as never;
}

function cipher() {
  return { decrypt: (v: string) => v, encrypt: (v: string) => v } as never;
}

function message(overrides: Partial<MailMessage> = {}): MailMessage {
  return {
    id: 'msg-1',
    tenantId: 'tenant-a',
    threadId: 'thread-1',
    uid: 42,
    deliveryStatus: 'unknown',
    deliveryDetail: null,
    messageId: '<a@mail>',
    inReplyTo: null,
    references: [],
    folder: 'INBOX',
    subject: 'Invoice 42',
    from: { address: 'customer@example.com', name: null },
    to: [{ address: 'ops@tenant.com', name: null }],
    cc: [],
    bcc: [],
    bodyText: 'hi',
    bodyHtml: null,
    attachments: [],
    sentAt: '2026-08-24T10:00:00.000Z',
    receivedAt: '2026-08-24T10:00:01.000Z',
    seen: true,
    starred: false,
    labels: ['Client-A'],
    ...overrides,
  };
}

describe('UpdateMessageFlagsUseCase', () => {
  it('writes to the mailbox before updating the local copy', async () => {
    const repo = new InMemoryMailboxRepository();
    await repo.saveMessages([message()]);
    const calls: string[] = [];
    const writer = {
      setFlags: vi.fn(async () => {
        calls.push('imap');
      }),
    };
    const findByIdSpy = vi.spyOn(repo, 'updateFlags');

    const useCase = new UpdateMessageFlagsUseCase(
      tokenService() as never,
      userRepo() as never,
      credentials(),
      writer,
      repo,
      cipher(),
    );

    await useCase.execute(TOKEN, { messageId: 'msg-1', starred: true });

    expect(writer.setFlags).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'imap.x.com' }),
      'INBOX',
      42,
      expect.objectContaining({ starred: true }),
    );
    expect(findByIdSpy).toHaveBeenCalled();
  });

  it('does not touch the local copy when the upstream write fails', async () => {
    const repo = new InMemoryMailboxRepository();
    await repo.saveMessages([message({ starred: false })]);
    const writer = { setFlags: vi.fn(async () => { throw new Error('imap store failed'); }) };

    const useCase = new UpdateMessageFlagsUseCase(
      tokenService() as never,
      userRepo() as never,
      credentials(),
      writer,
      repo,
      cipher(),
    );

    await expect(useCase.execute(TOKEN, { messageId: 'msg-1', starred: true })).rejects.toThrow('imap store failed');

    const stored = await repo.findById('tenant-a', 'msg-1');
    expect(stored?.starred).toBe(false);
  });

  it('merges labels: adds new ones, removes requested ones, keeps the rest', async () => {
    const repo = new InMemoryMailboxRepository();
    await repo.saveMessages([message({ labels: ['Client-A', 'Urgent'] })]);
    const writer = { setFlags: vi.fn(async () => {}) };

    const useCase = new UpdateMessageFlagsUseCase(
      tokenService() as never,
      userRepo() as never,
      credentials(),
      writer,
      repo,
      cipher(),
    );

    const result = await useCase.execute(TOKEN, {
      messageId: 'msg-1',
      addLabels: ['Follow-up'],
      removeLabels: ['Urgent'],
    });

    expect(result.data.labels.sort()).toEqual(['Client-A', 'Follow-up'].sort());
    const stored = await repo.findById('tenant-a', 'msg-1');
    expect(stored?.labels.sort()).toEqual(['Client-A', 'Follow-up'].sort());
  });

  it('throws when the message does not exist', async () => {
    const repo = new InMemoryMailboxRepository();
    const writer = { setFlags: vi.fn(async () => {}) };
    const useCase = new UpdateMessageFlagsUseCase(
      tokenService() as never,
      userRepo() as never,
      credentials(),
      writer,
      repo,
      cipher(),
    );

    await expect(useCase.execute(TOKEN, { messageId: 'ghost', starred: true })).rejects.toBeInstanceOf(
      MessageNotFoundError,
    );
    expect(writer.setFlags).not.toHaveBeenCalled();
  });

  it('throws when no mailbox is connected for the tenant', async () => {
    const repo = new InMemoryMailboxRepository();
    await repo.saveMessages([message()]);
    const writer = { setFlags: vi.fn(async () => {}) };
    const useCase = new UpdateMessageFlagsUseCase(
      tokenService() as never,
      userRepo() as never,
      credentials(false),
      writer,
      repo,
      cipher(),
    );

    await expect(useCase.execute(TOKEN, { messageId: 'msg-1', starred: true })).rejects.toBeInstanceOf(
      MailboxNotConnectedError,
    );
  });
});

describe('InMemoryMailboxRepository flags', () => {
  it('finds a message by id and updates its flags', async () => {
    const repo = new InMemoryMailboxRepository();
    await repo.saveMessages([message()]);

    const found = await repo.findById('tenant-a', 'msg-1');
    expect(found?.labels).toEqual(['Client-A']);

    await repo.updateFlags('tenant-a', 'msg-1', { starred: true });
    const updated = await repo.findById('tenant-a', 'msg-1');
    expect(updated?.starred).toBe(true);
    // Labels untouched when only starred is passed.
    expect(updated?.labels).toEqual(['Client-A']);
  });

  it('returns null for a message in a different tenant', async () => {
    const repo = new InMemoryMailboxRepository();
    await repo.saveMessages([message()]);
    expect(await repo.findById('tenant-b', 'msg-1')).toBeNull();
  });
});
