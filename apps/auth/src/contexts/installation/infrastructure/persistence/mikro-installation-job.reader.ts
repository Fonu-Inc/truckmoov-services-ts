import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { INSTALLATION_TIME_ZONE } from '@shared/devices';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type {
  ActivityMeasure,
  DeviceScopeEntry,
  DeviceScopeQuery,
  InstallationJobReader,
  JobEvent,
  JobEventType,
  JobFilters,
  JobPageRequest,
  JobRow,
  JobSort,
  MonthlyCount,
  MonthRange,
} from '@auth/installation/domain/installation-job.reader';
import { INSTALLATION_SLOT_HOURS } from '@auth/installation/domain/installation-order';
import type { StoredInstallationOrder } from '@auth/installation/domain/installation-order.repository';

type Row = Record<string, unknown> & { total: number };

const SLOT_START = `case o.time_slot ${Object.entries(INSTALLATION_SLOT_HOURS)
  .map(([slot, hours]) => `when '${slot}' then ${hours.start}`)
  .join(' ')} end`;

const ORDER_BY: Record<JobSort, string> = {
  scheduled: `o.scheduled_date asc, ${SLOT_START} asc, o.created_at asc, o.id asc`,
  completion: 'coalesce(o.completed_at, o.cancelled_at) desc nulls last, o.id asc',
  newest: 'o.created_at desc, o.id asc',
};

/** Everything a filter reads; the list columns join on to it. */
const COUNT_FROM = `
  from installation_orders o
  left join onboarding_applications app on app.id = o.application_id`;

const FROM = `${COUNT_FROM}
  left join lateral (
    select a.vehicle_id, a.fleet_device_id from installation_device_assignments a
     where a.order_id = o.id order by a.device_index limit 1
  ) fa on true
  left join onboarding_application_vehicles fv on fv.id = fa.vehicle_id
  left join lateral (
    select count(*)::int as device_count, count(distinct a.vehicle_id)::int as vehicle_count
      from installation_device_assignments a where a.order_id = o.id
  ) units on true`;

function escapeLike(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function whereOf(filters: JobFilters): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (condition: string, ...values: unknown[]) => {
    conditions.push(condition);
    params.push(...values);
  };

  if (filters.orderId) add('o.id = ?', filters.orderId);
  if (filters.installerId) add('o.installer_id = ?', filters.installerId);
  if (filters.statuses?.length === 0) add('false');
  if (filters.statuses?.length) add('o.status in (?)', [...filters.statuses]);
  if (filters.scheduledFrom) add('o.scheduled_date >= ?', filters.scheduledFrom);
  if (filters.scheduledBefore) add('o.scheduled_date < ?', filters.scheduledBefore);
  if (filters.completedFrom) add('coalesce(o.completed_at, o.cancelled_at) >= ?', filters.completedFrom);
  if (filters.completedBefore) add('coalesce(o.completed_at, o.cancelled_at) < ?', filters.completedBefore);

  const q = filters.search?.trim();
  if (q) {
    const pattern = escapeLike(q);
    add(
      `(o.order_number ilike ? or app.organization_name ilike ? or o.address_line ilike ? or o.city ilike ?
        or o.state ilike ?
        or exists (select 1 from installation_device_assignments sa
                     join onboarding_application_vehicles sv on sv.id = sa.vehicle_id
                    where sa.order_id = o.id and sv.registration_number ilike ?))`,
      ...Array(6).fill(pattern),
    );
  }

  return { sql: conditions.length ? `where ${conditions.join(' and ')}` : '', params };
}

function date(value: unknown): Date | null {
  return value ? new Date(value as string) : null;
}

function toOrder(row: Row): StoredInstallationOrder {
  return {
    id: String(row.id),
    orderNumber: String(row.order_number),
    applicationId: String(row.application_id),
    tenantId: String(row.tenant_id),
    scheduledDate: new Date(row.scheduled_date as string),
    timeSlot: row.time_slot as StoredInstallationOrder['timeSlot'],
    addressLine: String(row.address_line),
    city: String(row.city),
    state: String(row.state),
    siteContactName: String(row.site_contact_name),
    siteContactPhone: String(row.site_contact_phone),
    notes: (row.notes as string | null) ?? null,
    installerNotes: (row.installer_notes as string | null) ?? null,
    installerId: (row.installer_id as string | null) ?? null,
    status: row.status as StoredInstallationOrder['status'],
    preExceptionStatus: (row.pre_exception_status ?? null) as StoredInstallationOrder['preExceptionStatus'],
    assignedAt: date(row.assigned_at),
    acceptedAt: date(row.accepted_at),
    startedAt: date(row.started_at),
    issueReportedAt: date(row.issue_reported_at),
    completedAt: date(row.completed_at),
    cancelledAt: date(row.cancelled_at),
    reminderSentAt: date(row.reminder_sent_at),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function toJobRow(row: Row): JobRow {
  return {
    order: toOrder(row),
    customerName: (row.customer_name as string | null) ?? '',
    customerEmail: (row.customer_email as string | null) ?? null,
    firstVehicle: row.registration_number
      ? {
          registrationNumber: String(row.registration_number),
          make: String(row.make ?? ''),
          model: String(row.model ?? ''),
        }
      : null,
    firstFleetDeviceId: (row.fleet_device_id as string | null) ?? null,
    vehicleCount: Number(row.vehicle_count ?? 0),
    deviceCount: Number(row.device_count ?? 0),
  };
}

const DEVICE_SCOPE = `
  select o.tenant_id, o.id as order_id, o.order_number, a.fleet_device_id
    from installers i
    join installation_orders o on o.installer_id = i.id
    join installation_device_assignments a on a.order_id = o.id
   where i.user_id = ? and i.status = 'active' and a.fleet_device_id is not null
     and (o.status in (?) or (o.status = 'completed' and o.completed_at >= ? and o.completed_at < ?))
   order by o.scheduled_date asc, o.order_number asc, a.device_index asc`;

const MEASURE_COLUMNS: Record<ActivityMeasure, string> = {
  completed: 'completed_at',
  inProgress: 'started_at',
  scheduled: 'scheduled_date',
};

/** Stored dates are UTC midnight of their Lagos day, so the same Lagos conversion holds for them. */
function monthlyActivitySql(measure: ActivityMeasure): string {
  const column = `o.${MEASURE_COLUMNS[measure]}`;
  return `select to_char(${column} at time zone '${INSTALLATION_TIME_ZONE}', 'YYYY-MM') as month, count(*)::int as count
    from installation_orders o
   where o.installer_id = ? and o.status <> 'assigned' and ${column} >= ? and ${column} < ?
   group by 1`;
}

const EVENT_COLUMNS: Record<JobEventType, string> = {
  offered: 'assigned_at',
  accepted: 'accepted_at',
  started: 'started_at',
  issue_reported: 'issue_reported_at',
  completed: 'completed_at',
  cancelled: 'cancelled_at',
};

const EVENT_VALUES = Object.entries(EVENT_COLUMNS)
  .map(([type, column], step) => `('${type}', ${step}, o.${column})`)
  .join(', ');

const RECENT_EVENTS = `
  select e.type, e.occurred_at, o.id as order_id, o.order_number
    from installation_orders o
   cross join lateral (values ${EVENT_VALUES}) as e(type, step, occurred_at)
   where o.installer_id = ? and e.occurred_at is not null
   order by e.occurred_at desc, e.step desc, o.id asc
   limit ?`;

/** Jobs with their list columns in one query, joined to the onboarding tables they are read from. */
@Injectable()
export class MikroInstallationJobReader implements InstallationJobReader {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async list(filters: JobFilters, page: JobPageRequest): Promise<{ items: JobRow[]; total: number }> {
    const orm = await getAuthOrm(this.config.db);
    const where = whereOf(filters);
    const rows = await orm.em.getConnection().execute<Row[]>(
      `select o.*, app.organization_name as customer_name, app.business_email as customer_email,
              fv.registration_number, fv.make, fv.model, fa.fleet_device_id,
              units.device_count, units.vehicle_count, count(*) over ()::int as total
         ${FROM}
         ${where.sql}
        order by ${ORDER_BY[filters.sort ?? 'scheduled']}
        limit ? offset ?`,
      [...where.params, page.limit, (page.page - 1) * page.limit],
    );
    if (rows.length > 0) return { items: rows.map(toJobRow), total: Number(rows[0].total) };
    // Past the last page the window count has no row to ride on.
    return { items: [], total: page.page > 1 ? await this.count(filters) : 0 };
  }

  async count(filters: JobFilters): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const where = whereOf(filters);
    const [row] = await orm.em
      .getConnection()
      .execute<Array<{ total: number }>>(`select count(*)::int as total ${COUNT_FROM} ${where.sql}`, where.params);
    return Number(row?.total ?? 0);
  }

  async deviceScope(query: DeviceScopeQuery): Promise<DeviceScopeEntry[]> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em
      .getConnection()
      .execute<Array<Record<string, string>>>(DEVICE_SCOPE, [
        query.userId,
        [...query.statuses],
        query.completedFrom,
        query.completedBefore,
      ]);
    return rows.map((row) => ({
      tenantId: row.tenant_id,
      orderId: row.order_id,
      jobNumber: row.order_number,
      deviceId: row.fleet_device_id,
    }));
  }

  async monthlyActivity(installerId: string, measure: ActivityMeasure, range: MonthRange): Promise<MonthlyCount[]> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em
      .getConnection()
      .execute<Array<{ month: string; count: number }>>(monthlyActivitySql(measure), [installerId, range.from, range.before]);
    return rows.map((row) => ({ month: row.month, count: Number(row.count) }));
  }

  async recentEvents(installerId: string, limit: number): Promise<JobEvent[]> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<Record<string, unknown>>>(RECENT_EVENTS, [installerId, limit]);
    return rows.map((row) => ({
      type: row.type as JobEventType,
      orderId: String(row.order_id),
      jobNumber: String(row.order_number),
      occurredAt: new Date(row.occurred_at as string),
    }));
  }
}
