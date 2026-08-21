import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ComplianceReminderListener } from '../../../apps/auth/src/compliance-reminder.listener';

type Handler = (event: unknown) => Promise<void>;

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    type: 'compliance.documents.expiring',
    version: 1,
    occurred_at: new Date().toISOString(),
    tenant_id: 'tenant-a',
    data: {
      reminder_window_days: 7,
      audience: 'all_active_tenant_users',
      documents: [
        {
          id: 'doc-1',
          document_type: 'insurance',
          document_name: 'Insurance 2026',
          expiry_date: '2026-08-25',
          already_expired: false,
        },
      ],
    },
    ...overrides,
  };
}

function userRepoWith(users: Array<Record<string, unknown>>) {
  return { findAllByTenant: vi.fn().mockResolvedValue(users) };
}

describe('ComplianceReminderListener', () => {
  let bus: { subscribe: ReturnType<typeof vi.fn>; publish: ReturnType<typeof vi.fn> };
  let handler: Handler;

  beforeEach(() => {
    handler = async () => {};
    bus = {
      subscribe: vi.fn().mockImplementation(async (_subject: string, fn: Handler) => {
        handler = fn;
        return async () => {};
      }),
      publish: vi.fn().mockResolvedValue(undefined),
    };
  });

  async function start(users: Array<Record<string, unknown>>) {
    const repo = userRepoWith(users);
    const listener = new ComplianceReminderListener(bus as never, repo as never);
    await listener.onApplicationBootstrap();
    return { listener, repo };
  }

  it('sends one email request per enabled user on the account', async () => {
    await start([
      { id: 'u1', email: 'a@carrier.ng', accountStatus: 'enabled' },
      { id: 'u2', email: 'b@carrier.ng', accountStatus: 'enabled' },
      { id: 'u3', email: 'c@carrier.ng', accountStatus: 'enabled' },
    ]);

    await handler(buildEvent());

    expect(bus.publish).toHaveBeenCalledTimes(3);
    const recipients = bus.publish.mock.calls.map((call) => call[1].data.recipient);
    expect(recipients.sort()).toEqual(['a@carrier.ng', 'b@carrier.ng', 'c@carrier.ng']);
  });

  it('requests the email channel on the notification subject', async () => {
    await start([{ id: 'u1', email: 'a@carrier.ng', accountStatus: 'enabled' }]);

    await handler(buildEvent());

    const [subject, envelope] = bus.publish.mock.calls[0];
    expect(subject).toBe('tm.tenant-a.notification.send');
    expect(envelope.data.channel).toBe('email');
  });

  it('skips disabled users', async () => {
    await start([
      { id: 'u1', email: 'a@carrier.ng', accountStatus: 'enabled' },
      { id: 'u2', email: 'gone@carrier.ng', accountStatus: 'disabled' },
    ]);

    await handler(buildEvent());

    expect(bus.publish).toHaveBeenCalledTimes(1);
    expect(bus.publish.mock.calls[0][1].data.recipient).toBe('a@carrier.ng');
  });

  it('skips users with no email address', async () => {
    await start([
      { id: 'u1', email: 'a@carrier.ng', accountStatus: 'enabled' },
      { id: 'u2', email: '', accountStatus: 'enabled' },
    ]);

    await handler(buildEvent());

    expect(bus.publish).toHaveBeenCalledTimes(1);
  });

  it('treats a missing accountStatus as enabled', async () => {
    await start([{ id: 'u1', email: 'a@carrier.ng' }]);

    await handler(buildEvent());

    expect(bus.publish).toHaveBeenCalledTimes(1);
  });

  it('puts the subject on the first line and the documents in the body', async () => {
    await start([{ id: 'u1', email: 'a@carrier.ng', accountStatus: 'enabled' }]);

    await handler(buildEvent());

    const content: string = bus.publish.mock.calls[0][1].data.content;
    const [subjectLine, blank] = content.split('\n');
    expect(subjectLine).toBe('1 compliance document(s) expiring soon');
    expect(blank).toBe('');
    expect(content).toContain('Insurance 2026');
    expect(content).toContain('expires 2026-08-25');
  });

  it('leads with an action-needed subject when a document has already expired', async () => {
    await start([{ id: 'u1', email: 'a@carrier.ng', accountStatus: 'enabled' }]);

    await handler(
      buildEvent({
        data: {
          documents: [
            {
              id: 'doc-1',
              document_name: 'Roadworthiness',
              expiry_date: '2026-08-01',
              already_expired: true,
            },
          ],
        },
      }),
    );

    const content: string = bus.publish.mock.calls[0][1].data.content;
    expect(content.split('\n')[0]).toBe(
      'Action needed: 1 compliance document(s) have expired',
    );
    expect(content).toContain('EXPIRED 2026-08-01');
  });

  it('publishes nothing when the tenant has no usable recipient', async () => {
    await start([]);

    await handler(buildEvent());

    expect(bus.publish).not.toHaveBeenCalled();
  });

  it('ignores an event carrying no documents', async () => {
    const { repo } = await start([{ id: 'u1', email: 'a@carrier.ng' }]);

    await handler(buildEvent({ data: { documents: [] } }));

    expect(repo.findAllByTenant).not.toHaveBeenCalled();
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it('keeps sending to the remaining users when one publish fails', async () => {
    await start([
      { id: 'u1', email: 'a@carrier.ng' },
      { id: 'u2', email: 'b@carrier.ng' },
    ]);
    bus.publish.mockRejectedValueOnce(new Error('nats down'));

    await handler(buildEvent());

    expect(bus.publish).toHaveBeenCalledTimes(2);
  });
});
