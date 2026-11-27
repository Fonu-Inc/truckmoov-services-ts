import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { tableExists } from '@shared/db';
import { PLATFORM_STOCK_LABEL } from '@shared/devices';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import { ensureSystemActor } from './system-authz';

export class SystemDeviceNotFoundError extends Error {
  constructor(deviceId: string) {
    super(`Device ${deviceId} was not found`);
  }
}

type DeviceDetailRow = {
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
  battery_level?: number | string | null;
  last_seen?: string | Date | null;
  vehicle_id?: string | null;
  assigned_at?: string | Date | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
};
type ProtocolRow = { protocol_type?: string | null };
type TenantNameRow = { organization_name?: string | null };

export type SystemDeviceDetail = {
  id: string;
  imei: string;
  manufacturer: string;
  model: string;
  firmwareVersion: string | null;
  tenantId: string;
  tenantName: string;
  lifecycleStatus: string;
  operationalStatus: string;
  protocol: string | null;
  signalStrength: number | null;
  batteryLevel: number | null;
  lastSeen: string | null;
  vehicleId: string | null;
  assignedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class GetSystemDeviceDetailUseCase {
  constructor(
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(accessToken: string, deviceId: string) {
    const device = await this.getDetail(accessToken, deviceId);
    return {
      status: true,
      message: 'success',
      data: device,
    };
  }

  private async getDetail(
    accessToken: string,
    deviceId: string,
  ): Promise<SystemDeviceDetail> {
    await ensureSystemActor(
      accessToken,
      this.tokenService,
      this.userRepository,
      { forbiddenMessage: 'You are not permitted to view device inventory' },
    );

    if (this.config.persistence.backend === 'in-memory') {
      throw new SystemDeviceNotFoundError(deviceId);
    }

    const orm = await getAuthOrm(this.config.db);
    const connection = orm.em.getConnection();
    if (!(await tableExists(connection, 'fleet_devices'))) {
      throw new SystemDeviceNotFoundError(deviceId);
    }

    const rows = await connection.execute<DeviceDetailRow[]>(
      `select id, imei, manufacturer, model, firmware_version, protocol, tenant_id, status,
              lifecycle_status, signal_strength, battery_level, last_seen, vehicle_id,
              assigned_at, created_at, updated_at
       from fleet_devices
       where id = ?
       limit 1`,
      [deviceId],
    );
    const row = rows[0];
    if (!row) {
      throw new SystemDeviceNotFoundError(deviceId);
    }

    const tenantId = row.tenant_id?.toString() ?? '';
    const [catalogProtocol, tenantName] = await Promise.all([
      this.loadProtocol(
        connection,
        row.manufacturer?.toString() ?? '',
        row.model?.toString() ?? '',
      ),
      this.loadTenantName(connection, tenantId),
    ]);
    // What the installer configured is the device's protocol; the catalogue is
    // only a fallback for devices that predate the column being written.
    const protocol = row.protocol?.toString() ?? catalogProtocol;

    return {
      id: row.id?.toString() ?? deviceId,
      imei: row.imei?.toString() ?? '',
      manufacturer: row.manufacturer?.toString() ?? '',
      model: row.model?.toString() ?? '',
      firmwareVersion: row.firmware_version?.toString() ?? null,
      tenantId,
      tenantName:
        tenantId === SYSTEM_TENANT_ID
          ? PLATFORM_STOCK_LABEL
          : (tenantName ?? 'Unknown tenant'),
      lifecycleStatus: row.lifecycle_status?.toString() ?? 'registered',
      operationalStatus: row.status?.toString() ?? 'registered',
      protocol,
      signalStrength:
        row.signal_strength == null ? null : Number(row.signal_strength),
      batteryLevel: row.battery_level == null ? null : Number(row.battery_level),
      lastSeen: this.toIsoString(row.last_seen),
      vehicleId: row.vehicle_id?.toString() ?? null,
      assignedAt: this.toIsoString(row.assigned_at),
      createdAt: this.toIsoString(row.created_at) ?? new Date().toISOString(),
      updatedAt: this.toIsoString(row.updated_at) ?? new Date().toISOString(),
    };
  }

  private async loadProtocol(
    connection: Awaited<
      ReturnType<typeof getAuthOrm>
    >['em']['getConnection'] extends () => infer T
      ? T
      : never,
    manufacturer: string,
    model: string,
  ): Promise<string | null> {
    if (!manufacturer || !model) {
      return null;
    }
    if (!(await tableExists(connection, 'system_device_models'))) {
      return null;
    }
    const rows = await connection.execute<ProtocolRow[]>(
      `select protocol_type
       from system_device_models
       where lower(manufacturer) = lower(?) and lower(model) = lower(?)
       limit 1`,
      [manufacturer, model],
    );
    return rows[0]?.protocol_type?.toString() ?? null;
  }

  private async loadTenantName(
    connection: Awaited<
      ReturnType<typeof getAuthOrm>
    >['em']['getConnection'] extends () => infer T
      ? T
      : never,
    tenantId: string,
  ): Promise<string | null> {
    if (!tenantId) {
      return null;
    }
    const rows = await connection.execute<TenantNameRow[]>(
      `select organization_name
       from (
         select tenant_id, branding->>'organizationName' as organization_name
         from auth_organization_settings
         union
         select tenant_id, company->>'companyName' as organization_name
         from system_tenant_onboardings
       ) names
       where tenant_id = ? and organization_name is not null
       limit 1`,
      [tenantId],
    );
    return rows[0]?.organization_name?.toString().trim() || null;
  }

  private toIsoString(value?: string | Date | null) {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
}
