import { describe, expect, it, vi } from 'vitest';
import {
  SendMailUseCase,
  MailboxNotConnectedError,
  ReplyTargetNotFoundError,
} from '../../../apps/auth/src/contexts/mailbox/send-mail.use-case';

const KEY = Buffer.alloc(32, 3);

function cipher() {
  return {
    decrypt: (value: string) => `plain-${value}`,
  } as never;
}

function credentials(present = true) {
  return {
    findByTenant: vi.fn(async () =>
      present
        ? {
            tenantId: 'tenant-a',
            emailAddress: 'ops@tenant.com',
            displayName: 'Tenant Ops',
            imap: { host: 'imap.x.com', port: 993, username: 'u', secure: true, passwordCiphertext: 'ic', passwordPreview: 'p' },
            smtp: { host: 'smtp.x.com', port: 587, username: 'u', secure: true, passwordCiphertext: 'sc', passwordPreview: 'p' },
            lastVerifiedAt: null,
            lastError: null,
            updatedAt: '2026-08-24T10:00:00.000Z',
          }
        : null,
    ),
    recordVerification: vi.fn(async () => {}),
  } as never;
}

function threadMessages(messages: unknown[]) {
  return { listMessagesInThread: vi.fn(async () => messages) } as never;
}

function reader(sent: string | null = '[Gmail]/Sent Mail') {
  return {
    discoverFolders: vi.fn(async () => ({
      all: ['INBOX', sent ?? ''].filter(Boolean),
      inbox: 'INBOX',
      sent,
      trash: null,
      drafts: null,
      junk: null,
    })),
    fetchMessages: vi.fn(async () => []),
  } as never;
}

function build(options: { present?: boolean; messages?: unknown[]; outcome?: unknown; sent?: string | null } = {}) {
  const send = vi.fn(async () => options.outcome ?? {
    messageId: '<generated>',
    accepted: true,
    filedToSent: true,
    filingError: null,
  });
  const useCase = new SendMailUseCase(
    credentials(options.present ?? true),
    { send } as never,
    reader(options.sent === undefined ? '[Gmail]/Sent Mail' : options.sent),
    threadMessages(options.messages ?? []),
    cipher(),
  );
  return { useCase, send };
}

const base = {
  tenantId: 'tenant-a',
  to: [{ address: 'customer@example.com', name: null }],
  subject: 'Invoice 42',
  bodyText: 'here it is',
};

describe('sending mail', () => {
  it('refuses when no mailbox is connected', async () => {
    await expect(build({ present: false }).useCase.execute(base)).rejects.toBeInstanceOf(
      MailboxNotConnectedError,
    );
  });

  it('sends from the connected address', async () => {
    const { useCase, send } = build();

    await useCase.execute(base);

    expect(send.mock.calls[0][0].from).toEqual({ address: 'ops@tenant.com', name: 'Tenant Ops' });
  });

  it('generates a message id before sending, so both copies share it', async () => {
    const { useCase, send } = build();

    await useCase.execute(base);

    expect(send.mock.calls[0][0].messageId).toMatch(/^<.+@tenant\.com>$/);
  });

  it('files to Sent as part of sending, not as a later step', async () => {
    const { useCase, send } = build();

    await useCase.execute(base);

    // One call carries both the smtp and the imap side: the sender performs the
    // send and the filing as a single operation.
    expect(send.mock.calls[0][0].smtp.host).toBe('smtp.x.com');
    expect(send.mock.calls[0][0].imap.host).toBe('imap.x.com');
    expect(send.mock.calls[0][0].sentFolder).toBe('[Gmail]/Sent Mail');
  });


  it('files to the folder the server declares, not a guessed name', async () => {
    const { useCase, send } = build({ sent: '[Gmail]/Sent Mail' });

    await useCase.execute(base);

    // Filing to "Sent" on Gmail creates a stray folder the tenant's own client
    // never opens, so the message looks unsent to them.
    expect(send.mock.calls[0][0].sentFolder).toBe('[Gmail]/Sent Mail');
  });

  it('falls back only when the server declares no sent folder at all', async () => {
    const { useCase, send } = build({ sent: null });

    await useCase.execute(base);

    expect(send.mock.calls[0][0].sentFolder).toBe('Sent');
  });

  it('decrypts each password for the server that needs it', async () => {
    const { useCase, send } = build();

    await useCase.execute(base);

    expect(send.mock.calls[0][0].smtp.password).toBe('plain-sc');
    expect(send.mock.calls[0][0].imap.password).toBe('plain-ic');
  });

  it('reports a send that went but was not filed, rather than hiding it', async () => {
    const { useCase } = build({
      outcome: {
        messageId: '<m>',
        accepted: true,
        filedToSent: false,
        filingError: 'append refused',
      },
    });

    const result = await useCase.execute(base);

    expect(result.accepted).toBe(true);
    expect(result.filedToSent).toBe(false);
    expect(result.filingError).toBe('append refused');
  });
});

describe('replying threads on the recipient side', () => {
  const parent = {
    messageId: '<parent@mail>',
    references: ['<root@mail>'],
    subject: 'Invoice 42',
    sentAt: '2026-08-24T10:00:00.000Z',
  };

  it('refuses to reply to a thread that does not exist', async () => {
    await expect(
      build({ messages: [] }).useCase.execute({ ...base, replyToThreadId: 'missing' }),
    ).rejects.toBeInstanceOf(ReplyTargetNotFoundError);
  });

  it('sets in-reply-to from the newest message in the thread', async () => {
    const { useCase, send } = build({
      messages: [parent, { ...parent, messageId: '<newest@mail>', sentAt: '2026-08-24T12:00:00.000Z' }],
    });

    await useCase.execute({ ...base, replyToThreadId: 't1' });

    expect(send.mock.calls[0][0].inReplyTo).toBe('<newest@mail>');
  });

  it('carries the whole ancestry in references', async () => {
    const { useCase, send } = build({ messages: [parent] });

    await useCase.execute({ ...base, replyToThreadId: 't1' });

    expect(send.mock.calls[0][0].references).toEqual(['<root@mail>', '<parent@mail>']);
  });

  it('does not repeat an id already present in the ancestry', async () => {
    const { useCase, send } = build({
      messages: [{ ...parent, references: ['<root@mail>', '<parent@mail>'] }],
    });

    await useCase.execute({ ...base, replyToThreadId: 't1' });

    expect(send.mock.calls[0][0].references).toEqual(['<root@mail>', '<parent@mail>']);
  });

  it('prefixes the subject once, not on every reply', async () => {
    const { useCase, send } = build({ messages: [{ ...parent, subject: 'Re: Invoice 42' }] });

    await useCase.execute({ ...base, replyToThreadId: 't1' });

    expect(send.mock.calls[0][0].subject).toBe('Re: Invoice 42');
  });

  it('adds the prefix when the parent has none', async () => {
    const { useCase, send } = build({ messages: [parent] });

    await useCase.execute({ ...base, replyToThreadId: 't1' });

    expect(send.mock.calls[0][0].subject).toBe('Re: Invoice 42');
  });

  it('sends no threading headers on a fresh message', async () => {
    const { useCase, send } = build();

    await useCase.execute(base);

    expect(send.mock.calls[0][0].inReplyTo).toBeNull();
    expect(send.mock.calls[0][0].references).toEqual([]);
  });
});
