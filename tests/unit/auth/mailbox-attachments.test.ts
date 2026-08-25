import { describe, expect, it, vi } from 'vitest';
import {
  AttachmentNotFoundError,
  DownloadAttachmentUseCase,
} from '../../../apps/auth/src/contexts/mailbox/download-attachment.use-case';
import { InMemoryMailboxRepository } from '../../../apps/auth/src/contexts/mailbox/in-memory-mailbox.repository';
import type { MailMessage } from '../../../apps/auth/src/contexts/mailbox/mailbox.domain';

function storedMessage(overrides: Partial<MailMessage> = {}): MailMessage {
  return {
    id: 'row-1',
    tenantId: 'tenant-a',
    threadId: 'thread-1',
    uid: 42,
    deliveryStatus: 'unknown',
    deliveryDetail: null,
    messageId: '<a@mail>',
    inReplyTo: null,
    references: [],
    folder: 'INBOX',
    subject: 'Invoice',
    from: { address: 'customer@example.com', name: null },
    to: [],
    cc: [],
    bcc: [],
    bodyText: null,
    bodyHtml: null,
    attachments: [
      { id: '<a@mail>#0', filename: 'invoice.pdf', contentType: 'application/pdf', sizeBytes: 10, storageKey: null },
    ],
    sentAt: '2026-08-24T10:00:00.000Z',
    receivedAt: '2026-08-24T10:00:01.000Z',
    seen: true,
    ...overrides,
  };
}

async function build(message: MailMessage | null = storedMessage()) {
  const repository = new InMemoryMailboxRepository();
  if (message) await repository.saveMessages([message]);

  const fetchAttachment = vi.fn(async () => ({
    filename: 'invoice.pdf',
    contentType: 'application/pdf',
    content: Buffer.from('pdf-bytes'),
  }));
  const putObject = vi.fn(async () => 'stored');
  const createPresignedDownloadUrl = vi.fn(async () => 'https://signed/link');

  const useCase = new DownloadAttachmentUseCase(
    { resolveAccessToken: () => ({ id: 'user-1' }) } as never,
    {
      findById: async () => ({
        id: 'user-1',
        email: 'a@b.com',
        role: 'ENTERPRISE_ADMIN',
        tenantId: 'tenant-a',
        accountStatus: 'enabled',
        passwordHash: 'x',
        profile: {},
      }),
    } as never,
    {
      findByTenant: async () => ({
        tenantId: 'tenant-a',
        emailAddress: 'ops@tenant.com',
        displayName: null,
        imap: { host: 'imap.x.com', port: 993, username: 'u', secure: true, passwordCiphertext: 'c', passwordPreview: 'p' },
        smtp: { host: 'smtp.x.com', port: 587, username: 'u', secure: true, passwordCiphertext: 'c', passwordPreview: 'p' },
        lastVerifiedAt: null,
        lastError: null,
        updatedAt: '2026-08-24T10:00:00.000Z',
      }),
      recordVerification: async () => {},
      listConnectedTenantIds: async () => ['tenant-a'],
    } as never,
    repository,
    { fetchAttachment } as never,
    { putObject, createPresignedDownloadUrl } as never,
    { decrypt: () => 'plain' } as never,
    // Storage accounting has its own tests; this exercises the fetch and cache.
    { record: async () => {}, assertRoomFor: async () => {} } as never,
  );

  return { useCase, repository, fetchAttachment, putObject, createPresignedDownloadUrl };
}

describe('downloading an attachment', () => {
  it('fetches the bytes on first request and stores them', async () => {
    const { useCase, fetchAttachment, putObject } = await build();

    const result = await useCase.execute('token', '<a@mail>', 0);

    expect(fetchAttachment).toHaveBeenCalledTimes(1);
    expect(putObject).toHaveBeenCalledTimes(1);
    expect(result.url).toBe('https://signed/link');
  });

  it('uses the uid and folder the message was read from', async () => {
    const { useCase, fetchAttachment } = await build();

    await useCase.execute('token', '<a@mail>', 0);

    expect(fetchAttachment.mock.calls[0][0]).toMatchObject({ uid: 42, folder: 'INBOX', index: 0 });
  });

  it('does not go back to the mail server once stored', async () => {
    const { useCase, fetchAttachment } = await build();

    await useCase.execute('token', '<a@mail>', 0);
    await useCase.execute('token', '<a@mail>', 0);

    expect(fetchAttachment).toHaveBeenCalledTimes(1);
  });

  it('remembers where it put the bytes', async () => {
    const { useCase, repository } = await build();

    await useCase.execute('token', '<a@mail>', 0);

    const message = await repository.findByMessageId('tenant-a', '<a@mail>');
    expect(message?.attachments[0].storageKey).toContain('mailbox/tenant-a/');
  });

  it('keys storage by tenant, so two organisations cannot collide', async () => {
    const { useCase, putObject } = await build();

    await useCase.execute('token', '<a@mail>', 0);

    expect((putObject.mock.calls[0][0] as { key: string }).key).toMatch(/^mailbox\/tenant-a\//);
  });

  it('stores the object privately, not publicly readable', async () => {
    const { useCase, putObject } = await build();

    await useCase.execute('token', '<a@mail>', 0);

    expect(putObject.mock.calls[0][0]).toMatchObject({ visibility: 'private' });
  });

  it('hands back a link that expires', async () => {
    const { useCase, createPresignedDownloadUrl } = await build();

    const result = await useCase.execute('token', '<a@mail>', 0);

    expect(createPresignedDownloadUrl.mock.calls[0][0]).toMatchObject({ expiresIn: 300 });
    expect(result.expiresInSeconds).toBe(300);
  });

  it('refuses a message this tenant does not have', async () => {
    const { useCase } = await build(null);

    await expect(useCase.execute('token', '<missing@mail>', 0)).rejects.toBeInstanceOf(
      AttachmentNotFoundError,
    );
  });

  it('refuses an index the message does not have', async () => {
    const { useCase } = await build();

    await expect(useCase.execute('token', '<a@mail>', 7)).rejects.toBeInstanceOf(
      AttachmentNotFoundError,
    );
  });

  it('refuses when the mail server no longer holds the attachment', async () => {
    const { useCase } = await build();
    const emptyReader = { fetchAttachment: vi.fn(async () => null) };
    const stripped = Object.assign(Object.create(Object.getPrototypeOf(useCase)), useCase, {
      reader: emptyReader,
    });

    await expect(stripped.execute('token', '<a@mail>', 0)).rejects.toBeInstanceOf(
      AttachmentNotFoundError,
    );
  });
});
