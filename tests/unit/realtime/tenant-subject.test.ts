import { describe, expect, it } from 'vitest';
import {
  mayDeliver,
  roomFor,
  tenantOfSubject,
} from '../../../apps/realtime/src/tenant-subject';

describe('tenant of a subject', () => {
  it('reads the tenant slot', () => {
    expect(tenantOfSubject('tm.tenant-a.mailbox.updated')).toBe('tenant-a');
  });

  it('returns null for a wildcard, which names no tenant', () => {
    expect(tenantOfSubject('tm.*.mailbox.updated')).toBeNull();
    expect(tenantOfSubject('tm.>.mailbox.updated')).toBeNull();
  });

  it('returns null for a subject that is not ours', () => {
    expect(tenantOfSubject('other.tenant-a.thing')).toBeNull();
    expect(tenantOfSubject('tm.tenant-a')).toBeNull();
    expect(tenantOfSubject('')).toBeNull();
  });
});

describe('delivery is decided by the verified tenant, never by the client', () => {
  it('delivers a tenant its own events', () => {
    expect(mayDeliver('tm.tenant-a.mailbox.updated', 'tenant-a')).toBe(true);
  });

  it('refuses another tenant events', () => {
    expect(mayDeliver('tm.tenant-b.mailbox.updated', 'tenant-a')).toBe(false);
  });

  // The tenant slot does not always hold a tenant.
  it('refuses a platform-wide system event', () => {
    expect(mayDeliver('tm.system.compliance.reminder', 'tenant-a')).toBe(false);
    expect(mayDeliver('tm.system.compliance.reminder', 'system')).toBe(false);
  });

  it('refuses a subject with no tenant at all', () => {
    expect(mayDeliver('tm.*.mailbox.updated', 'tenant-a')).toBe(false);
  });

  it('is not fooled by a tenant id that merely starts the same', () => {
    expect(mayDeliver('tm.tenant-a-evil.mailbox.updated', 'tenant-a')).toBe(false);
    expect(mayDeliver('tm.tenant-a.mailbox.updated', 'tenant-a-evil')).toBe(false);
  });
});

describe('room naming', () => {
  it('namespaces the room, so a tenant id cannot collide with another room', () => {
    expect(roomFor('tenant-a')).toBe('tenant:tenant-a');
  });

  it('gives two tenants two rooms', () => {
    expect(roomFor('tenant-a')).not.toBe(roomFor('tenant-b'));
  });
});
