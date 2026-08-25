import { describe, expect, it } from 'vitest';
import { readBounceReport, type MailMessage } from '../../../apps/auth/src/contexts/mailbox/mailbox.domain';

function message(overrides: Partial<MailMessage> = {}): MailMessage {
  return {
    id: 'row-1',
    tenantId: 'tenant-a',
    threadId: 'thread-1',
    uid: 1,
    deliveryStatus: 'unknown',
    deliveryDetail: null,
    messageId: '<bounce@mail>',
    inReplyTo: null,
    references: [],
    folder: 'INBOX',
    subject: 'Delivery Status Notification (Failure)',
    from: { address: 'mailer-daemon@googlemail.com', name: 'Mail Delivery Subsystem' },
    to: [{ address: 'ops@tenant.com', name: null }],
    cc: [],
    bcc: [],
    bodyText: [
      'Your message was not delivered.',
      '',
      'Message-ID: <original-123@tenant.com>',
      'Diagnostic-Code: smtp; 550 5.1.1 The email account does not exist.',
      'Status: 5.1.1',
    ].join('\n'),
    bodyHtml: null,
    attachments: [],
    sentAt: '2026-08-24T10:00:00.000Z',
    receivedAt: '2026-08-24T10:00:01.000Z',
    seen: false,
    ...overrides,
  };
}

describe('reading a bounce', () => {
  it('recognises a report from the mail delivery subsystem', () => {
    expect(readBounceReport(message())?.originalMessageId).toBe('<original-123@tenant.com>');
  });

  it('recognises one from postmaster', () => {
    const report = readBounceReport(
      message({ from: { address: 'postmaster@example.com', name: null }, subject: 'Failure' }),
    );

    expect(report).not.toBeNull();
  });

  it('recognises one by subject when the sender is unfamiliar', () => {
    const report = readBounceReport(
      message({
        from: { address: 'noreply@relay.example', name: null },
        subject: 'Undelivered Mail Returned to Sender',
      }),
    );

    expect(report?.originalMessageId).toBe('<original-123@tenant.com>');
  });

  it('passes the provider reason through verbatim', () => {
    expect(readBounceReport(message())?.reason).toBe(
      'smtp; 550 5.1.1 The email account does not exist.',
    );
  });

  it('falls back to the status code when there is no diagnostic', () => {
    const report = readBounceReport(
      message({
        bodyText: 'Message-ID: <original-123@tenant.com>\nStatus: 4.4.7',
      }),
    );

    expect(report?.reason).toBe('Delivery failed with status 4.4.7');
  });

  // The whole point: a person saying "that failed" is not a delivery report.
  it('ignores a human reply that merely mentions failure', () => {
    const report = readBounceReport(
      message({
        from: { address: 'customer@example.com', name: 'A Customer' },
        subject: 'Re: Invoice 42',
        bodyText: 'This delivery failed on our side, can you resend?',
      }),
    );

    expect(report).toBeNull();
  });

  it('returns null when the report quotes no message id', () => {
    expect(readBounceReport(message({ bodyText: 'Delivery failed.', references: [] }))).toBeNull();
  });

  it('falls back to the references header when the body quotes nothing', () => {
    const report = readBounceReport(
      message({ bodyText: 'Delivery failed.', references: ['<original-999@tenant.com>'] }),
    );

    expect(report?.originalMessageId).toBe('<original-999@tenant.com>');
  });

  it('does not mistake a recipient address for the quoted message id', () => {
    const report = readBounceReport(
      message({
        bodyText: [
          'Delivery to <someone@example.com> failed.',
          'Message-ID: <original-123@tenant.com>',
        ].join('\n'),
      }),
    );

    expect(report?.originalMessageId).toBe('<original-123@tenant.com>');
  });
});
