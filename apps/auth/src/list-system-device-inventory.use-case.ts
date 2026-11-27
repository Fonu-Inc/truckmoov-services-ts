import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { tableExists } from '@shared/db';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import { ensureSystemActor } from './system-authz';
import {
  FAILED_PROVISION_SQL,
  buildInventoryCte,
  type DeviceInventoryFilters,
  type DeviceInventoryQuery,
  type InventoryBucket,
} from './system-device-inventory-query';

type DeviceInventoryRow = {
  id?: string;
  imei?: string;
  manufacturer?: string;
  model?: string;
  firmware_version?: string | null;
  protocol?: string | null;
  tenant_id?: string;
  status?: string;
  lifecycle_status?: string;
  signal_strength?: number | string | null;
  last_seen?: string | Date | null;
  vehicle_id?: string | null;
  assigned_at?: string | Date | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  provision_status?: string | null;
  provision_attempts?: number | string | null;
  provision_next_attempt_at?: string | Date | null;
  provision_error?: string | null;
  tenant_name?: string | null;
  bucket?: string | null;
};

type CountsRow = {
  total?: number | string;
  all?: number | string;
  active?: number | string;
  inactive?: number | string;
  assigned?: number | string;
  unassigned?: number | string;
  failed_provision?: number | string;
};

export type SystemDeviceInventorySummary = {
  all: number;
  active: number;
  inactive: number;
  assigned: number;
  unassigned: number;
  failedProvision: number;
};

const EMPTY_SUMMARY: SystemDeviceInventorySummary = {
  all: 0,
  active: 0,
  inactive: 0,
  assigned: 0,
  unassigned: 0,
  failedProvision: 0,
};

export type SystemDeviceInventoryListItem = {
  id: string;
  imei: string;
  manufacturer: string;
  model: string;
  firmwareVersion: string | null;
  protocol: string | null;
  tenantId: string;
  tenantName: string;
  isPlatformStock: boolean;
  bucket: InventoryBucket;
  lifecycleStatus: string;
  operationalStatus: string;
  signalStrength: number | null;
  lastSeen: string | null;
  vehicleId: string | null;
  assignedAt: string | null;
  createdAt: string;
  updatedAt: string;
  provisionStatus: string | null;
  provisionAttempts: number;
  provisionNextAttemptAt: string | null;
  provisionError: string | null;
};

@Injectable()
export class ListSystemDeviceInventoryUseCase {
  constructor(
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(accessToken: string, query: DeviceInventoryQuery) {
    const { items, total, summary } = await this.query(
      accessToken,
      query.filters,
      { page: query.page, limit: query.limit },
    );
    return {
      status: true,
      message: 'success',
      data: {
        items,
        total,
        page: query.page,
        limit: query.limit,
        summary,
      },
    };
  }

  // shortcut: unpaged rows are built in memory for the CSV export, switch to a streamed cursor past ~100k rows.
  async listAll(
    accessToken: string,
    filters: DeviceInventoryFilters,
  ): Promise<SystemDeviceInventoryListItem[]> {
    return (await this.query(accessToken, filters, null)).items;
  }

  private async query(
    accessToken: string,
    filters: DeviceInventoryFilters,
    paging: { page: number; limit: number } | null,
  ): Promise<{
    items: SystemDeviceInventoryListItem[];
    total: number;
    summary: SystemDeviceInventorySummary;
  }> {
    await ensureSystemActor(
      accessToken,
      this.tokenService,
      this.userRepository,
      {
        forbiddenMessage: 'You are not permitted to view device inventory',
      },
    );

    const empty = { items: [], total: 0, summary: { ...EMPTY_SUMMARY } };
    if (this.config.persistence.backend === 'in-memory') {
      return empty;
    }

    const orm = await getAuthOrm(this.config.db);
    const connection = orm.em.getConnection();
    if (!(await tableExists(connection, 'fleet_devices'))) {
      return empty;
    }

    const cte = buildInventoryCte(filters);
    const pageSql = paging ? 'limit ? offset ?' : '';
    const pageParams = paging
      ? [paging.limit, (paging.page - 1) * paging.limit]
      : [];

    const [rows, counts] = await Promise.all([
      connection.execute<DeviceInventoryRow[]>(
        `${cte.sql}
        select id, imei, manufacturer, model, firmware_version, protocol, tenant_id,
          tenant_name, bucket, status, lifecycle_status, signal_strength, last_seen,
          vehicle_id, assigned_at, created_at, updated_at, provision_status,
          provision_attempts, provision_next_attempt_at, provision_error
        from flagged
        where matched
        order by created_at desc, id asc
        ${pageSql}`,
        [...cte.params, ...pageParams],
      ),
      paging
        ? connection.execute<CountsRow[]>(
            `${cte.sql}
            select
              (count(*) filter (where matched))::int as total,
              count(*)::int as "all",
              (count(*) filter (where bucket = 'active'))::int as active,
              (count(*) filter (where bucket = 'inactive'))::int as inactive,
              (count(*) filter (where bucket = 'assigned'))::int as assigned,
              (count(*) filter (where bucket = 'unassigned'))::int as unassigned,
              ${FAILED_PROVISION_SQL} as failed_provision
            from flagged`,
            cte.params,
          )
        : Promise.resolve([] as CountsRow[]),
    ]);

    const items = rows.map((row) => {
      const tenantId = row.tenant_id?.toString() ?? '';
      return {
        id: row.id?.toString() ?? '',
        imei: row.imei?.toString() ?? '',
        manufacturer: row.manufacturer?.toString() ?? '',
        model: row.model?.toString() ?? '',
        firmwareVersion: row.firmware_version?.toString() ?? null,
        protocol: row.protocol?.toString() ?? null,
        tenantId,
        tenantName: row.tenant_name?.toString() ?? 'Unknown tenant',
        isPlatformStock: tenantId === SYSTEM_TENANT_ID,
        bucket: (row.bucket?.toString() ?? 'unassigned') as InventoryBucket,
        lifecycleStatus: row.lifecycle_status?.toString() ?? 'registered',
        operationalStatus: row.status?.toString() ?? 'registered',
        signalStrength:
          row.signal_strength == null ? null : Number(row.signal_strength),
        lastSeen: this.toIsoString(row.last_seen),
        vehicleId: row.vehicle_id?.toString() ?? null,
        assignedAt: this.toIsoString(row.assigned_at),
        createdAt: this.toIsoString(row.created_at) ?? new Date().toISOString(),
        updatedAt: this.toIsoString(row.updated_at) ?? new Date().toISOString(),
        provisionStatus: row.provision_status?.toString() ?? null,
        provisionAttempts: Number(row.provision_attempts ?? 0),
        provisionNextAttemptAt: this.toIsoString(
          row.provision_next_attempt_at,
        ),
        provisionError: row.provision_error?.toString() ?? null,
      };
    });

    const c = counts[0];
    return {
      items,
      total: c ? Number(c.total ?? 0) : items.length,
      summary: c
        ? {
            all: Number(c.all ?? 0),
            active: Number(c.active ?? 0),
            inactive: Number(c.inactive ?? 0),
            assigned: Number(c.assigned ?? 0),
            unassigned: Number(c.unassigned ?? 0),
            failedProvision: Number(c.failed_provision ?? 0),
          }
        : { ...EMPTY_SUMMARY },
    };
  }

  private toIsoString(value?: string | Date | null) {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
}
