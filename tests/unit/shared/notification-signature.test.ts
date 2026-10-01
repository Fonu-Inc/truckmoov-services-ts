import { describe, expect, it } from 'vitest';
import { notificationSignature } from '@shared/eventbus';

describe('notificationSignature', () => {
  it('matches the Go service for the same event', () => {
    const envelope = {
      id: 'e-1',
      type: 'notification.send',
      version: 1,
      occurred_at: '2026-01-01T00:00:00.000Z',
      tenant_id: 't-1',
      data: { channel: 'email', recipient: 'a@b.ng', notification_type: 'x', content: 'héllo\nworld' },
    };
    expect(notificationSignature('s3cret', envelope)).toBe(
      '86d53a146b6c9c852f1892c48c8025774978cf0fbeebdba34b79eaa6465c50ef',
    );
  });

  it('changes when the tenant changes', () => {
    const base = { id: 'e', type: 't', version: 1, occurred_at: '', tenant_id: 'a', data: { content: 'x' } };
    expect(notificationSignature('k', base)).not.toBe(notificationSignature('k', { ...base, tenant_id: 'b' }));
  });
});
