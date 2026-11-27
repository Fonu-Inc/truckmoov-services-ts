import { describe, expect, it } from 'vitest';
import {
  FAILED_PROVISION_SQL,
  buildInventoryCte,
  parseDeviceInventoryQuery,
} from '../../../apps/auth/src/system-device-inventory-query';

const placeholders = (sql: string) => (sql.match(/\?/g) ?? []).length;

describe('parseDeviceInventoryQuery', () => {
  it('defaults to the first page of 50 across all scopes', () => {
    const q = parseDeviceInventoryQuery({});
    expect(q).toMatchObject({ page: 1, limit: 50 });
    expect(q.filters).toMatchObject({ scope: 'all', hideFaulty: false });
  });

  it('clamps paging instead of rejecting it', () => {
    expect(parseDeviceInventoryQuery({ page: '-3', limit: '9999' })).toMatchObject({ page: 1, limit: 200 });
    expect(parseDeviceInventoryQuery({ page: 'x', limit: 'x' })).toMatchObject({ page: 1, limit: 50 });
  });

  it('keeps page a finite integer within 1..1_000_000', () => {
    const page = (value: string) => parseDeviceInventoryQuery({ page: value }).page;
    expect(page('NaN')).toBe(1);
    expect(page('-Infinity')).toBe(1);
    expect(page('Infinity')).toBe(1_000_000);
    expect(page('1e400')).toBe(1_000_000);
    expect(page('99999999999')).toBe(1_000_000);
    expect(page('2.9')).toBe(2);
  });

  it('rejects bad enums, lastSeenDays and too many ids', () => {
    expect(() => parseDeviceInventoryQuery({ scope: 'nope' })).toThrow();
    expect(() => parseDeviceInventoryQuery({ bucket: 'nope' })).toThrow();
    expect(() => parseDeviceInventoryQuery({ lastSeenDays: '10' })).toThrow();
    const ids = Array.from({ length: 101 }, (_, i) => `d${i}`).join(',');
    expect(() => parseDeviceInventoryQuery({ ids })).toThrow();
  });
});

describe('buildInventoryCte', () => {
  it('binds every value and escapes LIKE wildcards in search', () => {
    const { filters } = parseDeviceInventoryQuery({
      search: '50%_a\\b',
      scope: 'assigned',
      tenantId: 't1',
      bucket: 'active',
      manufacturer: 'Teltonika',
      status: 'active',
      lastSeenDays: '7',
      hideFaulty: 'true',
      ids: 'a,b',
    });
    const { sql, params } = buildInventoryCte(filters);
    expect(placeholders(sql)).toBe(params.length);
    expect(sql).not.toContain('Teltonika');
    expect(params).toContain('%50\\%\\_a\\\\b%');
  });

  it('matches trimmed manufacturers and treats blanks as Unknown', () => {
    const { filters } = parseDeviceInventoryQuery({ manufacturer: 'Unknown' });
    const { sql, params } = buildInventoryCte(filters);
    expect(sql).toContain("lower(coalesce(nullif(trim(manufacturer), ''), 'Unknown')) = lower(?)");
    expect(params).toContain('Unknown');
    expect(placeholders(sql)).toBe(params.length);
  });

  it('binds only the tenant-name value when no filter is set', () => {
    const { sql, params } = buildInventoryCte(parseDeviceInventoryQuery({}).filters);
    expect(params).toHaveLength(1);
    expect(placeholders(sql)).toBe(1);
  });

  it('counts failed provisioning fleet-wide, ignoring scope and filters', () => {
    expect(FAILED_PROVISION_SQL).toContain("lifecycle_status <> 'decommissioned'");
    expect(FAILED_PROVISION_SQL).not.toMatch(/\?|base|flagged|matched|tenant_id/);
  });
});
