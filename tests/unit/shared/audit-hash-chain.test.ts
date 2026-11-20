import { describe, expect, it } from 'vitest';
import {
  GENESIS_HASH,
  canonicalJson,
  findChainBreak,
  hashAuditEntry,
  type ChainLink,
  type HashableAuditEntry,
} from '@shared/audit';

function entry(overrides: Partial<HashableAuditEntry> = {}): HashableAuditEntry {
  return {
    id: 'entry-1',
    tenantId: 'tenant-a',
    action: 'user.logged_in',
    entityType: 'user',
    entityId: 'user-1',
    actorId: 'user-1',
    actorRole: 'OWNER_OPERATOR',
    summary: 'User signed in',
    metadata: { email: 'a@example.com' },
    occurredAt: '2026-08-24T10:00:00.000Z',
    ...overrides,
  };
}

function chain(entries: HashableAuditEntry[]): ChainLink[] {
  let prevHash = GENESIS_HASH;
  return entries.map((item, index) => {
    const rowHash = hashAuditEntry(item, prevHash);
    const link: ChainLink = { ...item, seq: index + 1, prevHash, rowHash };
    prevHash = rowHash;
    return link;
  });
}

describe('canonicalJson', () => {
  it('sorts keys, so the same data built two ways hashes the same', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it('sorts nested keys too', () => {
    expect(canonicalJson({ outer: { z: 1, a: 2 } })).toBe('{"outer":{"a":2,"z":1}}');
  });

  it('keeps array order, which is data rather than layout', () => {
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it('drops undefined values instead of emitting them', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('hashAuditEntry', () => {
  it('is stable for the same entry and predecessor', () => {
    expect(hashAuditEntry(entry(), GENESIS_HASH)).toBe(hashAuditEntry(entry(), GENESIS_HASH));
  });

  it('changes when any covered field changes', () => {
    const baseline = hashAuditEntry(entry(), GENESIS_HASH);

    expect(hashAuditEntry(entry({ action: 'user.logged_out' }), GENESIS_HASH)).not.toBe(baseline);
    expect(hashAuditEntry(entry({ actorId: 'someone-else' }), GENESIS_HASH)).not.toBe(baseline);
    expect(hashAuditEntry(entry({ metadata: { email: 'b@example.com' } }), GENESIS_HASH)).not.toBe(baseline);
    expect(hashAuditEntry(entry({ occurredAt: '2026-08-24T10:00:01.000Z' }), GENESIS_HASH)).not.toBe(baseline);
  });

  it('changes when the predecessor changes, which is what links the chain', () => {
    expect(hashAuditEntry(entry(), GENESIS_HASH)).not.toBe(hashAuditEntry(entry(), 'f'.repeat(64)));
  });

  it('does not confuse field boundaries', () => {
    const left = hashAuditEntry(entry({ entityType: 'ab', entityId: 'c' }), GENESIS_HASH);
    const right = hashAuditEntry(entry({ entityType: 'a', entityId: 'bc' }), GENESIS_HASH);

    expect(left).not.toBe(right);
  });

  it('treats a null actor and an empty-string actor as the same absence', () => {
    expect(hashAuditEntry(entry({ actorId: null }), GENESIS_HASH)).toBe(
      hashAuditEntry(entry({ actorId: '' }), GENESIS_HASH),
    );
  });

  it('normalises the timestamp, so an offset and its UTC form agree', () => {
    expect(hashAuditEntry(entry({ occurredAt: '2026-08-24T11:00:00.000+01:00' }), GENESIS_HASH)).toBe(
      hashAuditEntry(entry({ occurredAt: '2026-08-24T10:00:00.000Z' }), GENESIS_HASH),
    );
  });
});

describe('findChainBreak', () => {
  it('accepts an intact chain', () => {
    const links = chain([entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })]);

    expect(findChainBreak(links)).toBeNull();
  });

  it('accepts an empty chain', () => {
    expect(findChainBreak([])).toBeNull();
  });

  it('catches an edited entry', () => {
    const links = chain([entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })]);
    links[1].action = 'user.deleted';

    expect(findChainBreak(links)).toMatchObject({ seq: 2, id: 'b', reason: 'hash_mismatch' });
  });

  it('catches an edited entry even when its own hash is recomputed', () => {
    const links = chain([entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })]);
    links[1].action = 'user.deleted';
    links[1].rowHash = hashAuditEntry(links[1], links[1].prevHash);

    // Its own hash now agrees, but the next entry still points at the old one.
    expect(findChainBreak(links)).toMatchObject({ seq: 3, id: 'c', reason: 'broken_link' });
  });

  it('catches a deleted entry', () => {
    const links = chain([entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })]);

    expect(findChainBreak([links[0], links[2]])).toMatchObject({ seq: 3, reason: 'broken_link' });
  });

  it('catches an entry inserted at the front', () => {
    const links = chain([entry({ id: 'a' }), entry({ id: 'b' })]);
    const forged: ChainLink = { ...entry({ id: 'forged' }), seq: 0, prevHash: GENESIS_HASH, rowHash: 'x'.repeat(64) };

    expect(findChainBreak([forged, ...links])).toMatchObject({ seq: 0, id: 'forged' });
  });

  it('reports the first break, not a later one', () => {
    const links = chain([entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })]);
    links[0].summary = 'tampered';
    links[2].summary = 'tampered too';

    expect(findChainBreak(links)).toMatchObject({ seq: 1, id: 'a' });
  });
});
