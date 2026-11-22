import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { lifecycleStatusesFor } from '@shared/devices';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import { ensureSystemActor } from './system-authz';

type DeviceInventoryFilters = {
  search?: string;
  manufacturer?: string;
  status?: string;
  lifecycleStatus?: string;
};

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
};

type ExistsRow = { exists?: boolean | number | string };
type TenantNameRow = { tenant_id?: string; organization_name?: string | null };

export type SystemDeviceInventoryListItem = {
  id: string;
  imei: string;
  manufacturer: string;
  model: string;
  firmwareVersion: string | null;
  protocol: string | null;
  tenantId: string;
  tenantName: string;
  lifecycleStatus: string;
  operationalStatus: string;
  signalStrength: number | null;
  lastSeen: string | null;
  vehicleId: string | null;
  assignedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

  async execute(accessToken: string, filters: DeviceInventoryFilters = {}) {
    const devices = await this.list(accessToken, filters);
    return {
      status: true,
      message: 'success',
      data: {
        total: devices.length,
        devices,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async list(
    accessToken: string,
    filters: DeviceInventoryFilters = {},
  ): Promise<SystemDeviceInventoryListItem[]> {
    await ensureSystemActor(
      accessToken,
      this.tokenService,
      this.userRepository,
      {
        forbiddenMessage: 'You are not permitted to view device inventory',
      },
    );

    if (this.config.persistence.backend === 'in-memory') {
      return [];
    }

    const orm = await getAuthOrm(this.config.db);
    const connection = orm.em.getConnection();
    const existsRows = await connection.execute<ExistsRow[]>(
      "select exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = ?) as exists",
      ['fleet_devices'],
    );
    if (!this.toBoolean(existsRows[0]?.exists)) {
      return [];
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.manufacturer?.trim()) {
      conditions.push('lower(manufacturer) = lower(?)');
      params.push(filters.manufacturer.trim());
    }

    if (filters.lifecycleStatus?.trim()) {
      conditions.push('lower(lifecycle_status) = lower(?)');
      params.push(filters.lifecycleStatus.trim());
    }

    // The coarse status filter resolves to the lifecycle states that present as
    // that status, so both filters read the one authoritative column.
    if (filters.status?.trim()) {
      const lifecycles = lifecycleStatusesFor(filters.status);
      if (lifecycles.length === 0) return [];
      conditions.push(
        `lifecycle_status in (${lifecycles.map(() => '?').join(', ')})`,
      );
      params.push(...lifecycles);
    }

    const whereClause =
      conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';

    const rows = await connection.execute<DeviceInventoryRow[]>(
      `
        select
          id,
          imei,
          manufacturer,
          model,
          firmware_version,
          protocol,
          tenant_id,
          status,
          lifecycle_status,
          signal_strength,
          last_seen,
          vehicle_id,
          assigned_at,
          created_at,
          updated_at
        from fleet_devices
        ${whereClause}
        order by created_at desc, imei asc
      `,
      params,
    );

    const tenantNames = await this.loadTenantNames(connection);
    const search = filters.search?.trim().toLowerCase();

    return rows
      .map((row) => {
        const tenantId = row.tenant_id?.toString() ?? '';
        return {
          id: row.id?.toString() ?? '',
          imei: row.imei?.toString() ?? '',
          manufacturer: row.manufacturer?.toString() ?? '',
          model: row.model?.toString() ?? '',
          firmwareVersion: row.firmware_version?.toString() ?? null,
          protocol: row.protocol?.toString() ?? null,
          tenantId,
          tenantName: tenantNames.get(tenantId) ?? 'Unknown tenant',
          lifecycleStatus: row.lifecycle_status?.toString() ?? 'registered',
          operationalStatus: row.status?.toString() ?? 'registered',
          signalStrength:
            row.signal_strength == null ? null : Number(row.signal_strength),
          lastSeen: this.toIsoString(row.last_seen),
          vehicleId: row.vehicle_id?.toString() ?? null,
          assignedAt: this.toIsoString(row.assigned_at),
          createdAt:
            this.toIsoString(row.created_at) ?? new Date().toISOString(),
          updatedAt:
            this.toIsoString(row.updated_at) ?? new Date().toISOString(),
        };
      })
      .filter((row) => {
        if (!search) {
          return true;
        }
        return [
          row.id,
          row.imei,
          row.manufacturer,
          row.model,
          row.tenantId,
          row.tenantName,
          row.lifecycleStatus,
          row.operationalStatus,
        ].some((value) => value.toLowerCase().includes(search));
      });
  }

  private async loadTenantNames(
    connection: Awaited<
      ReturnType<typeof getAuthOrm>
    >['em']['getConnection'] extends () => infer T
      ? T
      : never,
  ) {
    const rows = await connection.execute<TenantNameRow[]>(
      `
        select tenant_id, organization_name
        from (
          select
            tenant_id,
            coalesce(branding->>'organizationName', null) as organization_name
          from auth_organization_settings
          union
          select
            tenant_id,
            coalesce(company->>'companyName', null) as organization_name
          from system_tenant_onboardings
        ) names
        where tenant_id is not null
      `,
    );

    const tenantNames = new Map<string, string>();
    for (const row of rows) {
      const tenantId = row.tenant_id?.toString();
      const organizationName = row.organization_name?.toString().trim();
      if (!tenantId || !organizationName) {
        continue;
      }
      if (!tenantNames.has(tenantId)) {
        tenantNames.set(tenantId, organizationName);
      }
    }
    return tenantNames;
  }

  private toBoolean(value: unknown) {
    return (
      value === true ||
      value === 1 ||
      value === '1' ||
      value === 't' ||
      value === 'true'
    );
  }

  private toIsoString(value?: string | Date | null) {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
}
