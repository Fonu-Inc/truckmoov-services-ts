import { BadRequestException, applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import {
  DEVICE_LIFECYCLE_STATUSES,
  DEVICE_STATUSES,
  PLATFORM_STOCK_LABEL,
  lifecycleStatusesFor,
} from '@shared/devices';
import { SYSTEM_TENANT_ID } from '@shared/identity';

export const INVENTORY_SCOPES = ['assigned', 'stock', 'all'] as const;
export const INVENTORY_BUCKETS = [
  'active',
  'inactive',
  'assigned',
  'unassigned',
] as const;
const LAST_SEEN_DAYS = [7, 30, 90] as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_IDS = 100;
const MAX_SEARCH = 100;
const MAX_PAGE = 1_000_000;

export type InventoryScope = (typeof INVENTORY_SCOPES)[number];
export type InventoryBucket = (typeof INVENTORY_BUCKETS)[number];

export type DeviceInventoryFilters = {
  search?: string;
  scope: InventoryScope;
  tenantId?: string;
  bucket?: InventoryBucket;
  manufacturer?: string;
  status?: string;
  lifecycleStatus?: string;
  lastSeenDays?: number;
  hideFaulty: boolean;
  ids?: string[];
};

export type DeviceInventoryQuery = {
  filters: DeviceInventoryFilters;
  page: number;
  limit: number;
};

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

function oneOf<T extends string>(
  name: string,
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  const raw = text(value)?.toLowerCase();
  if (raw === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new BadRequestException(`${name} must be one of ${allowed.join(', ')}`);
  }
  return raw as T;
}

// NaN falls back to 1; Infinity and huge values clamp to the cap so they never reach Postgres.
function parsePage(value: unknown) {
  const n = Math.floor(Number(value));
  return Number.isNaN(n) ? 1 : Math.min(MAX_PAGE, Math.max(1, n));
}

export function parseDeviceInventoryQuery(
  raw: Record<string, unknown>,
): DeviceInventoryQuery {
  const lastSeen = text(raw.lastSeenDays);
  const lastSeenDays = lastSeen === undefined ? undefined : Number(lastSeen);
  if (
    lastSeenDays !== undefined &&
    !(LAST_SEEN_DAYS as readonly number[]).includes(lastSeenDays)
  ) {
    throw new BadRequestException('lastSeenDays must be one of 7, 30, 90');
  }

  const idsRaw = text(raw.ids);
  const ids = idsRaw
    ?.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids && ids.length > MAX_IDS) {
    throw new BadRequestException(`ids accepts at most ${MAX_IDS} values`);
  }

  return {
    filters: {
      search: text(raw.search)?.slice(0, MAX_SEARCH),
      scope: oneOf('scope', raw.scope, INVENTORY_SCOPES) ?? 'all',
      tenantId: text(raw.tenantId),
      bucket: oneOf('bucket', raw.bucket, INVENTORY_BUCKETS),
      manufacturer: text(raw.manufacturer),
      status: oneOf('status', raw.status, DEVICE_STATUSES),
      lifecycleStatus: oneOf(
        'lifecycleStatus',
        raw.lifecycleStatus,
        DEVICE_LIFECYCLE_STATUSES,
      ),
      lastSeenDays,
      hideFaulty: text(raw.hideFaulty) === 'true',
      ids: ids?.length ? ids : undefined,
    },
    page: parsePage(raw.page),
    limit: Math.min(
      MAX_LIMIT,
      Math.max(1, Math.floor(Number(raw.limit)) || DEFAULT_LIMIT),
    ),
  };
}

// Server twin of the admin page's device-status buckets; read both status
// columns because an assigned-from-stock device is lifecycle 'assignable'.
// Unassigned platform stock reads 'unassigned' even though its status projects to 'active'.
const BUCKET_SQL = `case
  when d.status in ('inactive','offline','suspended','decommissioned')
    or d.lifecycle_status in ('inactive','offline','suspended','decommissioned') then 'inactive'
  when d.tenant_id = '${SYSTEM_TENANT_ID}' and d.vehicle_id is null then 'unassigned'
  when d.status = 'active' then 'active'
  when d.lifecycle_status = 'assigned' or d.status = 'assigned' or d.vehicle_id is not null then 'assigned'
  else 'unassigned' end`;

const TENANT_NAME_SQL = `case when d.tenant_id = ? then '${PLATFORM_STOCK_LABEL}'
  else coalesce(nullif(trim(os.branding->>'organizationName'), ''), nullif(trim(ob.company->>'companyName'), ''), 'Unknown tenant') end`;

// Fleet-wide on purpose: the retry mutation requeues every failed device, so the count ignores scope and filters.
export const FAILED_PROVISION_SQL = `(select count(*)::int from fleet_devices
  where provision_status = 'failed' and lifecycle_status <> 'decommissioned')`;

const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');

/**
 * The `with` prefix shared by the page and count queries. `base` carries the
 * scope (what the stat cards count); `flagged` adds `matched` for the filters.
 * Every user value is a bound parameter.
 */
export function buildInventoryCte(filters: DeviceInventoryFilters) {
  const baseWhere: string[] = [];
  const baseParams: unknown[] = [];
  if (filters.scope === 'assigned') {
    baseWhere.push('d.tenant_id <> ?');
    baseParams.push(SYSTEM_TENANT_ID);
  } else if (filters.scope === 'stock') {
    baseWhere.push('d.tenant_id = ?');
    baseParams.push(SYSTEM_TENANT_ID);
  }
  if (filters.tenantId) {
    baseWhere.push('d.tenant_id = ?');
    baseParams.push(filters.tenantId);
  }
  if (filters.hideFaulty) {
    baseWhere.push(
      "coalesce(d.lifecycle_status, '') <> 'faulty' and coalesce(d.status, '') <> 'faulty'",
    );
  }

  const match: string[] = [];
  const matchParams: unknown[] = [];
  if (filters.search) {
    const pattern = `%${escapeLike(filters.search)}%`;
    const columns = [
      'imei',
      'model',
      'manufacturer',
      'id',
      'tenant_id',
      'tenant_name',
    ];
    match.push(`(${columns.map((c) => `${c} ilike ?`).join(' or ')})`);
    matchParams.push(...columns.map(() => pattern));
  }
  if (filters.bucket) {
    match.push('bucket = ?');
    matchParams.push(filters.bucket);
  }
  if (filters.manufacturer) {
    // Mirrors the manufacturers endpoint: trimmed, blanks labelled 'Unknown'.
    match.push("lower(coalesce(nullif(trim(manufacturer), ''), 'Unknown')) = lower(?)");
    matchParams.push(filters.manufacturer);
  }
  if (filters.lifecycleStatus) {
    match.push('lower(lifecycle_status) = lower(?)');
    matchParams.push(filters.lifecycleStatus);
  }
  if (filters.status) {
    const lifecycles = lifecycleStatusesFor(filters.status);
    match.push(`lifecycle_status in (${lifecycles.map(() => '?').join(', ')})`);
    matchParams.push(...lifecycles);
  }
  if (filters.lastSeenDays) {
    match.push("last_seen >= now() - (?::int * interval '1 day')");
    matchParams.push(filters.lastSeenDays);
  }
  if (filters.ids) {
    match.push(`id in (${filters.ids.map(() => '?').join(', ')})`);
    matchParams.push(...filters.ids);
  }

  const sql = `with base as (
      select d.id, d.imei, d.manufacturer, d.model, d.firmware_version, d.protocol,
        d.tenant_id, d.status, d.lifecycle_status, d.signal_strength, d.last_seen,
        d.vehicle_id, d.assigned_at, d.created_at, d.updated_at, d.provision_status,
        d.provision_attempts, d.provision_next_attempt_at, d.provision_error,
        ${TENANT_NAME_SQL} as tenant_name,
        ${BUCKET_SQL} as bucket
      from fleet_devices d
      left join auth_organization_settings os on os.tenant_id = d.tenant_id
      left join system_tenant_onboardings ob on ob.tenant_id = d.tenant_id
      ${baseWhere.length ? `where ${baseWhere.join(' and ')}` : ''}
    ), flagged as (
      select base.*, ${match.length ? match.join(' and ') : 'true'} as matched from base
    )`;

  return { sql, params: [SYSTEM_TENANT_ID, ...baseParams, ...matchParams] };
}

export function ApiInventoryFilters() {
  const query = (name: string, extra: Record<string, unknown> = {}) =>
    ApiQuery({ name, required: false, type: String, ...extra });
  return applyDecorators(
    query('search', { description: 'Matches IMEI, model, manufacturer, id, tenant id or tenant name (max 100 chars)' }),
    query('scope', { enum: [...INVENTORY_SCOPES], description: 'assigned = tenant-owned, stock = platform stock. Default all.' }),
    query('tenantId'),
    query('bucket', { enum: [...INVENTORY_BUCKETS] }),
    query('manufacturer'),
    query('status', {
      enum: [...DEVICE_STATUSES],
      description:
        'Coarse status. Resolves to the lifecycle states that present as it.',
    }),
    query('lifecycleStatus', { enum: [...DEVICE_LIFECYCLE_STATUSES] }),
    query('lastSeenDays', { enum: [...LAST_SEEN_DAYS] }),
    query('hideFaulty', { enum: ['true', 'false'] }),
  );
}
