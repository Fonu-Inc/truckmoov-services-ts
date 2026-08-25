import { describe, expect, it, vi } from 'vitest';
import { SyncMailboxUseCase } from '../../../apps/auth/src/contexts/mailbox/sync-mailbox.use-case';
import { InMemoryMailboxRepository } from '../../../apps/auth/src/contexts/mailbox/in-memory-mailbox.repository';

function credentials() {
  return {
    findByTenant: vi.fn(async () => ({
      tenantId: 'tenant-a',
      emailAddress: 'ops@tenant.com',
      displayName: null,
      imap: { host: 'imap.x.com', port: 993, username: 'u', secure: true, passwordCiphertext: 'c', passwordPreview: 'p' },
      smtp: { host: 'smtp.x.com', port: 587, username: 'u', secure: true, passwordCiphertext: 'c', passwordPreview: 'p' },
      lastVerifiedAt: null,
      lastError: null,
      updatedAt: '2026-08-24T10:00:00.000Z',
    })),
    recordVerification: vi.fn(async () => {}),
    listConnectedTenantIds: vi.fn(async () => ['tenant-a']),
  } as never;
}

function fetched(overrides: Record<string, unknown> = {}) {
  return {
    uid: 1,
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
    seen: false,
    deliveryStatus: 'unknown',
    deliveryDetail: null,
    ...overrides,
  };
}

function build(messagesByFolder: Record<string, unknown[]>, folders?: Record<string, unknown>) {
  const repository = new InMemoryMailboxRepository();
  const reader = {
    discoverFolders: vi.fn(async () => ({
      all: ['INBOX', '[Gmail]/Sent Mail', '[Gmail]/Trash'],
      inbox: 'INBOX',
      sent: '[Gmail]/Sent Mail',
      trash: '[Gmail]/Trash',
      drafts: null,
      junk: null,
      ...folders,
    })),
    fetchMessages: vi.fn(async ({ folder }: { folder: string }) => messagesByFolder[folder] ?? []),
  };
  const publish = vi.fn(async () => {});
  const useCase = new SyncMailboxUseCase(
    credentials(),
    reader as never,
    repository,
    { decrypt: () => 'plain' } as never,
    { publish, subscribe: vi.fn(), isReady: vi.fn() } as never,
  );
  return { useCase, repository, reader, publish };
}

describe('multi-folder sync', () => {
  it('syncs inbox, sent and trash, each on its own cursor', async () => {
    const { useCase, reader } = build({});

    const summary = await useCase.syncAllFolders('tenant-a');

    expect(summary.folders.map((f) => f.folder)).toEqual([
      'INBOX',
      '[Gmail]/Sent Mail',
      '[Gmail]/Trash',
    ]);
    expect(reader.fetchMessages).toHaveBeenCalledTimes(3);
  });

  it('uses the folder names the server declares, not guessed ones', async () => {
    const { useCase, reader } = build({});

    await useCase.syncAllFolders('tenant-a');

    const folders = reader.fetchMessages.mock.calls.map((call) => (call[0] as { folder: string }).folder);
    expect(folders).toContain('[Gmail]/Sent Mail');
    expect(folders).not.toContain('Sent');
  });

  it('skips a role the server does not declare', async () => {
    const { useCase, reader } = build({}, { sent: null, trash: null });

    const summary = await useCase.syncAllFolders('tenant-a');

    expect(summary.folders.map((f) => f.folder)).toEqual(['INBOX']);
    expect(reader.fetchMessages).toHaveBeenCalledTimes(1);
  });

  it('keeps a separate cursor per folder', async () => {
    const { useCase, repository } = build({
      INBOX: [fetched({ uid: 7, messageId: '<in@mail>' })],
      '[Gmail]/Sent Mail': [fetched({ uid: 3, messageId: '<out@mail>' })],
    });

    await useCase.syncAllFolders('tenant-a');

    expect((await repository.getSyncState('tenant-a', 'INBOX'))?.lastUid).toBe(7);
    expect((await repository.getSyncState('tenant-a', '[Gmail]/Sent Mail'))?.lastUid).toBe(3);
  });

  it('carries on when one folder fails', async () => {
    const repository = new InMemoryMailboxRepository();
    const reader = {
      discoverFolders: vi.fn(async () => ({
        all: [], inbox: 'INBOX', sent: 'Sent', trash: null, drafts: null, junk: null,
      })),
      fetchMessages: vi.fn(async ({ folder }: { folder: string }) => {
        if (folder === 'Sent') throw new Error('folder unavailable');
        return [fetched()];
      }),
    };
    const useCase = new SyncMailboxUseCase(
      credentials(), reader as never, repository, { decrypt: () => 'plain' } as never,
      { publish: vi.fn(async () => {}), subscribe: vi.fn(), isReady: vi.fn() } as never,
    );

    const summary = await useCase.syncAllFolders('tenant-a');

    // The inbox still synced: one broken folder must not block the rest.
    expect(summary.folders.map((f) => f.folder)).toEqual(['INBOX']);
    expect(summary.failed).toEqual([{ folder: 'Sent', reason: 'folder unavailable' }]);
  });

  it('threads a reply onto its parent even when both arrive in one batch', async () => {
    const { useCase, repository } = build({
      INBOX: [
        fetched({ uid: 2, messageId: '<reply@mail>', inReplyTo: '<a@mail>', sentAt: '2026-08-24T11:00:00.000Z' }),
        fetched({ uid: 1, messageId: '<a@mail>', sentAt: '2026-08-24T10:00:00.000Z' }),
      ],
    });

    await useCase.execute('tenant-a', 'INBOX');

    const page = await repository.listThreads('tenant-a', 10, 0);
    expect(page.total).toBe(1);
    expect(page.threads[0].messageCount).toBe(2);
  });


  it('marks a sent message as bounced when its report arrives', async () => {
    const { useCase, repository } = build({
      INBOX: [
        fetched({ uid: 1, messageId: '<sent@tenant.com>', folder: 'INBOX' }),
        fetched({
          uid: 2,
          messageId: '<bounce@daemon>',
          from: { address: 'mailer-daemon@googlemail.com', name: null },
          subject: 'Delivery Status Notification (Failure)',
          bodyText: 'Message-ID: <sent@tenant.com>\nDiagnostic-Code: smtp; 550 no such user',
          sentAt: '2026-08-24T11:00:00.000Z',
        }),
      ],
    });

    await useCase.execute('tenant-a', 'INBOX');

    const original = await repository.findByMessageId('tenant-a', '<sent@tenant.com>');
    expect(original?.deliveryStatus).toBe('bounced');
    expect(original?.deliveryDetail).toBe('smtp; 550 no such user');
  });

  it('leaves an ordinary message alone', async () => {
    const { useCase, repository } = build({
      INBOX: [fetched({ uid: 1, messageId: '<normal@mail>' })],
    });

    await useCase.execute('tenant-a', 'INBOX');

    expect((await repository.findByMessageId('tenant-a', '<normal@mail>'))?.deliveryStatus).toBe(
      'unknown',
    );
  });

  it('ignores a report for a message this mailbox never sent', async () => {
    const { useCase, repository } = build({
      INBOX: [
        fetched({
          uid: 1,
          messageId: '<bounce@daemon>',
          from: { address: 'mailer-daemon@x.com', name: null },
          subject: 'Delivery Status Notification (Failure)',
          bodyText: 'Message-ID: <never-sent@elsewhere.com>',
        }),
      ],
    });

    // Does not throw, and stores nothing against an unknown message.
    await useCase.execute('tenant-a', 'INBOX');

    expect(await repository.findByMessageId('tenant-a', '<never-sent@elsewhere.com>')).toBeNull();
  });


  it('announces new mail on the tenant subject, so connected browsers hear it', async () => {
    const { useCase, publish } = build({
      INBOX: [fetched({ uid: 1, messageId: '<new@mail>' })],
    });

    await useCase.execute('tenant-a', 'INBOX');

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toBe('tm.tenant-a.mailbox.updated');
  });

  it('announces counts and thread ids, never message content', async () => {
    const { useCase, publish } = build({
      INBOX: [fetched({ uid: 1, messageId: '<new@mail>', bodyText: 'confidential body' })],
    });

    await useCase.execute('tenant-a', 'INBOX');

    const envelope = JSON.stringify(publish.mock.calls[0][1]);
    expect(envelope).not.toContain('confidential body');
    expect(publish.mock.calls[0][1]).toMatchObject({ data: { newMessages: 1 } });
  });

  it('says nothing when there was no new mail', async () => {
    const { useCase, publish } = build({ INBOX: [] });

    await useCase.execute('tenant-a', 'INBOX');

    expect(publish).not.toHaveBeenCalled();
  });

  it('still stores the mail when the announcement fails', async () => {
    const repository = new InMemoryMailboxRepository();
    const useCase = new SyncMailboxUseCase(
      credentials(),
      {
        discoverFolders: vi.fn(async () => ({
          all: [], inbox: 'INBOX', sent: null, trash: null, drafts: null, junk: null,
        })),
        fetchMessages: vi.fn(async () => [fetched({ uid: 1, messageId: '<kept@mail>' })]),
      } as never,
      repository,
      { decrypt: () => 'plain' } as never,
      {
        publish: vi.fn(async () => {
          throw new Error('nats down');
        }),
      } as never,
    );

    await useCase.execute('tenant-a', 'INBOX');

    expect(await repository.findByMessageId('tenant-a', '<kept@mail>')).not.toBeNull();
  });

  it('does nothing for a tenant with no mailbox connected', async () => {
    const repository = new InMemoryMailboxRepository();
    const useCase = new SyncMailboxUseCase(
      { findByTenant: async () => null, recordVerification: async () => {}, listConnectedTenantIds: async () => [] } as never,
      { discoverFolders: vi.fn(), fetchMessages: vi.fn() } as never,
      repository,
      { decrypt: () => 'plain' } as never,
      { publish: vi.fn(async () => {}), subscribe: vi.fn(), isReady: vi.fn() } as never,
    );

    await expect(useCase.syncAllFolders('tenant-a')).resolves.toMatchObject({ folders: [] });
  });
});
