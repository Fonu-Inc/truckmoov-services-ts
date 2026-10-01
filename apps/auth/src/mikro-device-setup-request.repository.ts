import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { readSetupRequestCharges, type DeviceSetupRequestCharges } from '@shared/devices';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import {
  SETUP_REQUEST_APPROVED_STATUSES,
  SETUP_REQUEST_PENDING_STATUSES,
  type DeviceSetupRequestFilters,
  type DeviceSetupRequestRepository,
  type DeviceSetupRequestStatus,
  type DeviceSetupRequestSummary,
  type StoredDeviceSetupRequest,
} from './device-setup-request.repository';

type Row = {
  id: string;
  tenant_id: string;
  organisation_name: string | null;
  requesting_email: string | null;
  reference_number: string;
  manufacturer: string | null;
  model: string | null;
  tracker_type: string | null;
  quantity: number | string;
  sim_required: boolean | string;
  vehicle_id: string | null;
  state: string | null;
  city: string | null;
  preferred_date: string | null;
  use_case: string;
  notes: string | null;
  status: string;
  assigned_to: string | null;
  charges: unknown;
  decided_by: string | null;
  decided_at: Date | string | null;
  decision_reason: string | null;
  timeline: unknown;
  created_at: Date | string;
  updated_at: Date | string;
  kyc_status: string | null;
};

/**
 * A name the tenant sent wins; otherwise the one the tenants list shows, from
 * onboarding then branding. Fleet has no tenant names, so it stores none.
 */
const ORGANISATION_NAME = `coalesce(
  nullif(trim(r.organisation_name), ''),
  (select nullif(trim(o.company->>'companyName'), '')
     from system_tenant_onboardings o
    where o.tenant_id = r.tenant_id
    order by o.created_at desc
    limit 1),
  (select nullif(trim(s.branding->>'organizationName'), '')
     from auth_organization_settings s
    where s.tenant_id = r.tenant_id)
)`;

const SELECT_COLUMNS = `
  r.id,
  r.tenant_id,
  ${ORGANISATION_NAME} as organisation_name,
  r.requesting_email,
  r.reference_number,
  r.manufacturer,
  r.model,
  r.tracker_type,
  r.quantity,
  r.sim_required,
  r.vehicle_id,
  r.state,
  r.city,
  r.preferred_date,
  r.use_case,
  r.notes,
  r.status,
  r.assigned_to,
  r.charges,
  r.decided_by,
  r.decided_at,
  r.decision_reason,
  r.timeline,
  r.created_at,
  r.updated_at,
  -- Onboarding approval is what KYC means now that the separate document set
  -- was retired. No application at all reads as unknown, not as pending.
  (
    select case a.status when 'approved' then 'verified' when 'rejected' then 'rejected' else 'pending' end
      from onboarding_applications a
     where a.tenant_id = r.tenant_id
     order by a.created_at desc
     limit 1
  ) as kyc_status
`;

/**
 * The platform's view of tenant-submitted device requests.
 *
 * Reads the fleet service's table directly. Same database, and the platform
 * device inventory already reads `fleet_devices` the same way; the alternative
 * was a second copy of the request, which is what this replaces.
 */
@Injectable()
export class MikroDeviceSetupRequestRepository implements DeviceSetupRequestRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findAll(
    filters?: DeviceSetupRequestFilters,
  ): Promise<StoredDeviceSetupRequest[]> {
    if (!(await this.tableExists())) return [];

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.status?.trim()) {
      conditions.push('r.status = ?');
      params.push(filters.status.trim());
    }
    if (filters?.tenantId?.trim()) {
      conditions.push('r.tenant_id = ?');
      params.push(filters.tenantId.trim());
    }
    if (filters?.assignedTo?.trim()) {
      conditions.push('r.assigned_to = ?');
      params.push(filters.assignedTo.trim());
    }
    if (filters?.manufacturer?.trim()) {
      conditions.push('lower(r.manufacturer) = lower(?)');
      params.push(filters.manufacturer.trim());
    }
    if (filters?.search?.trim()) {
      const term = `%${filters.search.trim().toLowerCase()}%`;
      conditions.push(
        `(lower(r.reference_number) like ?
          or lower(coalesce(${ORGANISATION_NAME}, '')) like ?
          or lower(coalesce(r.requesting_email, '')) like ?
          or lower(coalesce(r.manufacturer, '')) like ?
          or lower(coalesce(r.model, '')) like ?
          or lower(r.tenant_id) like ?)`,
      );
      params.push(term, term, term, term, term, term);
    }
    if (filters?.dateFrom?.trim()) {
      conditions.push('r.created_at >= ?');
      params.push(filters.dateFrom.trim());
    }
    if (filters?.dateTo?.trim()) {
      conditions.push('r.created_at <= ?');
      params.push(filters.dateTo.trim());
    }

    const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
    const rows = await this.query<Row>(
      `select ${SELECT_COLUMNS}
         from fleet_device_setup_requests r
         ${where}
        order by r.created_at asc`,
      params,
    );
    return rows.map(toStored);
  }

  async findById(id: string): Promise<StoredDeviceSetupRequest | null> {
    if (!(await this.tableExists())) return null;
    const rows = await this.query<Row>(
      `select ${SELECT_COLUMNS} from fleet_device_setup_requests r where r.id = ? limit 1`,
      [id],
    );
    return rows[0] ? toStored(rows[0]) : null;
  }

  async summary(): Promise<DeviceSetupRequestSummary> {
    const empty = { pendingApproval: 0, awaitingPayment: 0, approved: 0, rejected: 0, devicesRequested: 0 };
    if (!(await this.tableExists())) return empty;

    const pending = SETUP_REQUEST_PENDING_STATUSES;
    const approved = SETUP_REQUEST_APPROVED_STATUSES;
    const rows = await this.query<{
      pending_approval: number | string;
      awaiting_payment: number | string;
      approved: number | string;
      rejected: number | string;
      devices_requested: number | string | null;
    }>(
      `select
         count(*) filter (where status in (${placeholders(pending.length)}))::int as pending_approval,
         count(*) filter (where status = 'awaiting_payment')::int as awaiting_payment,
         count(*) filter (where status in (${placeholders(approved.length)}))::int as approved,
         count(*) filter (where status = 'rejected')::int as rejected,
         -- The card counts devices, not requests: one request for eight
         -- trackers is eight devices to source.
         coalesce(sum(quantity), 0)::int as devices_requested
       from fleet_device_setup_requests`,
      [...pending, ...approved],
    );

    const row = rows[0];
    if (!row) return empty;
    return {
      pendingApproval: Number(row.pending_approval ?? 0),
      awaitingPayment: Number(row.awaiting_payment ?? 0),
      approved: Number(row.approved ?? 0),
      rejected: Number(row.rejected ?? 0),
      devicesRequested: Number(row.devices_requested ?? 0),
    };
  }

  async recordDecision(input: {
    id: string;
    status: DeviceSetupRequestStatus;
    decidedBy: string;
    reason: string | null;
    charges: DeviceSetupRequestCharges | null;
    timeline: Array<{ status: string; at: string; note: string | null }>;
  }): Promise<void> {
    await this.execute(
      `update fleet_device_setup_requests
          set status = ?, decided_by = ?, decided_at = now(), decision_reason = ?,
              charges = ?::jsonb, timeline = ?::jsonb, updated_at = now()
        where id = ?`,
      [
        input.status,
        input.decidedBy,
        input.reason,
        input.charges ? JSON.stringify(input.charges) : null,
        JSON.stringify(input.timeline),
        input.id,
      ],
    );
  }

  async assign(
    id: string,
    assignedTo: string,
    timeline: Array<{ status: string; at: string; note: string | null }>,
  ): Promise<void> {
    await this.execute(
      `update fleet_device_setup_requests
          set assigned_to = ?, status = 'installation_in_progress', timeline = ?::jsonb, updated_at = now()
        where id = ?`,
      [assignedTo, JSON.stringify(timeline), id],
    );
  }

  async advance(input: {
    id: string;
    status: DeviceSetupRequestStatus;
    timeline: Array<{ status: string; at: string; note: string | null }>;
  }): Promise<void> {
    await this.execute(
      `update fleet_device_setup_requests
          set status = ?, timeline = ?::jsonb, updated_at = now()
        where id = ?`,
      [input.status, JSON.stringify(input.timeline), input.id],
    );
  }

  private async tableExists(): Promise<boolean> {
    if (this.config.persistence.backend === 'in-memory') return false;
    const rows = await this.query<{ exists: boolean | number | string }>(
      "select exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = ?) as exists",
      ['fleet_device_setup_requests'],
    );
    const value = rows[0]?.exists;
    return value === true || value === 1 || value === 't' || value === 'true';
  }

  private async query<T>(sql: string, params: unknown[]): Promise<T[]> {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.getConnection().execute<T[]>(sql, params);
  }

  private async execute(sql: string, params: unknown[]): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.getConnection().execute(sql, params);
  }
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

function toStored(row: Row): StoredDeviceSetupRequest {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    organisationName: row.organisation_name,
    requestingEmail: row.requesting_email,
    referenceNumber: row.reference_number,
    manufacturer: row.manufacturer,
    model: row.model,
    trackerType: row.tracker_type,
    quantity: Number(row.quantity ?? 1),
    simRequired: row.sim_required === true || row.sim_required === 't' || row.sim_required === 'true',
    vehicleId: row.vehicle_id,
    state: row.state,
    city: row.city,
    preferredInstallDate: row.preferred_date ? new Date(row.preferred_date) : null,
    useCase: row.use_case,
    notes: row.notes,
    status: row.status as DeviceSetupRequestStatus,
    kycStatus: (row.kyc_status as StoredDeviceSetupRequest['kycStatus']) ?? null,
    assignedTo: row.assigned_to,
    charges: readSetupRequestCharges(row.charges),
    decidedBy: row.decided_by,
    decidedAt: row.decided_at ? new Date(row.decided_at) : null,
    decisionReason: row.decision_reason,
    timeline: normalizeTimeline(row.timeline),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function normalizeTimeline(raw: unknown): StoredDeviceSetupRequest['timeline'] {
  const parsed = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      status: String(entry['status'] ?? ''),
      at: String(entry['at'] ?? ''),
      note: entry['note'] == null ? null : String(entry['note']),
    }));
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
