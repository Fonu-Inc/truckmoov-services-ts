import { describe, expect, it } from 'vitest';
import {
  participantsOf,
  resolveThreadId,
  summariseThread,
  type MailMessage,
} from '../../../apps/auth/src/contexts/mailbox/mailbox.domain';

function message(overrides: Partial<MailMessage> = {}): MailMessage {
  return {
    id: 'row-1',
    tenantId: 'tenant-a',
    threadId: 'thread-1',
    messageId: '<a@mail>',
    inReplyTo: null,
    references: [],
    folder: 'INBOX',
    subject: 'Invoice 42',
    from: { address: 'ops@customer.com', name: 'Ops' },
    to: [{ address: 'billing@tenant.com', name: null }],
    cc: [],
    bcc: [],
    bodyText: 'hello',
    bodyHtml: null,
    attachments: [],
    sentAt: '2026-08-24T10:00:00.000Z',
    receivedAt: '2026-08-24T10:00:01.000Z',
    seen: true,
    ...overrides,
  };
}

describe('threading follows the mail headers', () => {
  it('starts a new thread for a message with no ancestry', () => {
    expect(resolveThreadId(message(), new Map())).toBe('<a@mail>');
  });

  it('joins the thread of the message it replies to', () => {
    const known = new Map([['<a@mail>', 'thread-1']]);

    expect(
      resolveThreadId(message({ messageId: '<b@mail>', inReplyTo: '<a@mail>' }), known),
    ).toBe('thread-1');
  });

  it('follows the references chain, so a deep reply stays in one thread', () => {
    const known = new Map([['<a@mail>', 'thread-1']]);

    expect(
      resolveThreadId(
        message({ messageId: '<d@mail>', inReplyTo: '<c@mail>', references: ['<a@mail>', '<b@mail>', '<c@mail>'] }),
        known,
      ),
    ).toBe('thread-1');
  });

  it('prefers the references root over in-reply-to', () => {
    const known = new Map([
      ['<a@mail>', 'thread-root'],
      ['<c@mail>', 'thread-branch'],
    ]);

    expect(
      resolveThreadId(
        message({ messageId: '<d@mail>', inReplyTo: '<c@mail>', references: ['<a@mail>'] }),
        known,
      ),
    ).toBe('thread-root');
  });

  it('does not merge two conversations that only share a subject', () => {
    const first = resolveThreadId(message({ messageId: '<x@one>' }), new Map());
    const second = resolveThreadId(message({ messageId: '<y@two>' }), new Map());

    expect(first).not.toBe(second);
  });

  it('uses the references root when the parent is not stored', () => {
    expect(
      resolveThreadId(
        message({ messageId: '<z@mail>', inReplyTo: '<missing@mail>', references: ['<root@mail>'] }),
        new Map(),
      ),
    ).toBe('<root@mail>');
  });
});

describe('participants', () => {
  it('collects sender, to and cc, deduplicated by address', () => {
    const participants = participantsOf([
      message({ from: { address: 'A@customer.com', name: 'A' }, cc: [{ address: 'c@x.com', name: null }] }),
      message({ from: { address: 'a@customer.com', name: 'A' } }),
    ]);

    expect(participants.map((p) => p.address).sort()).toEqual([
      'a@customer.com',
      'billing@tenant.com',
      'c@x.com',
    ]);
  });

  it('keeps a name once one is seen', () => {
    const participants = participantsOf([
      message({ to: [{ address: 'x@y.com', name: null }] }),
      message({ to: [{ address: 'x@y.com', name: 'Ex Why' }] }),
    ]);

    expect(participants.find((p) => p.address === 'x@y.com')?.name).toBe('Ex Why');
  });

  // A blind copy is hidden from the other recipients by definition.
  it('never exposes a bcc recipient', () => {
    const participants = participantsOf([
      message({ bcc: [{ address: 'secret@watcher.com', name: 'Secret' }] }),
    ]);

    expect(participants.map((p) => p.address)).not.toContain('secret@watcher.com');
  });
});

describe('thread summary', () => {
  it('takes the subject from the oldest message', () => {
    const thread = summariseThread('t1', 'tenant-a', [
      message({ subject: 'Re: Invoice 42', sentAt: '2026-08-24T11:00:00.000Z' }),
      message({ subject: 'Invoice 42', sentAt: '2026-08-24T10:00:00.000Z' }),
    ]);

    expect(thread.subject).toBe('Invoice 42');
  });

  it('reports the newest message time', () => {
    const thread = summariseThread('t1', 'tenant-a', [
      message({ sentAt: '2026-08-24T10:00:00.000Z' }),
      message({ sentAt: '2026-08-24T12:00:00.000Z' }),
    ]);

    expect(thread.lastMessageAt).toBe('2026-08-24T12:00:00.000Z');
  });

  it('is unread when any message is unread', () => {
    const thread = summariseThread('t1', 'tenant-a', [
      message({ seen: true }),
      message({ seen: false }),
    ]);

    expect(thread.hasUnread).toBe(true);
  });

  it('counts every message', () => {
    expect(summariseThread('t1', 'tenant-a', [message(), message(), message()]).messageCount).toBe(3);
  });

  it('does not leak a bcc into the thread view', () => {
    const thread = summariseThread('t1', 'tenant-a', [
      message({ bcc: [{ address: 'secret@watcher.com', name: null }] }),
    ]);

    expect(JSON.stringify(thread)).not.toContain('secret@watcher.com');
  });
});
