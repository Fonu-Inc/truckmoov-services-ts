import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  DEVICE_MODEL_CATALOG_REPOSITORY,
  type DeviceModelCatalogRepository,
} from './device-model-catalog.repository';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import { ensureSystemActor } from './system-authz';

type CountRow = Record<string, number | string | null | undefined>;
type ExistsRow = { exists?: boolean | number | string };

@Injectable()
export class GetSystemDeviceSummaryUseCase {
  constructor(
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(DEVICE_MODEL_CATALOG_REPOSITORY)
    private readonly deviceModelCatalogRepository: DeviceModelCatalogRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(
      accessToken,
      this.tokenService,
      this.userRepository,
      {
        forbiddenMessage: 'You are not permitted to view device summary data',
      },
    );

    const inventory =
      this.config.persistence.backend === 'in-memory'
        ? {
            totalDevices: 0,
            registeredDevices: 0,
            configuredDevices: 0,
            verifiedActiveDevices: 0,
            pendingConfigDevices: 0,
            onlineNowDevices: 0,
            assignableDevices: 0,
            assignedDevices: 0,
            activeDevices: 0,
            faultyDevices: 0,
          }
        : await this.getInventoryCounts();

    const catalogModels = await this.deviceModelCatalogRepository.findAll();

    return {
      status: true,
      message: 'success',
      data: {
        ...inventory,
        totalCatalogModels: catalogModels.length,
        supportedCatalogModels: catalogModels.filter(
          (entry) => entry.status === 'supported',
        ).length,
        deprecatedCatalogModels: catalogModels.filter(
          (entry) => entry.status === 'deprecated',
        ).length,
        blockedCatalogModels: catalogModels.filter(
          (entry) => entry.status === 'blocked',
        ).length,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private async getInventoryCounts() {
    const orm = await getAuthOrm(this.config.db);
    const connection = orm.em.getConnection();
    const existsRows = await connection.execute<ExistsRow[]>(
      "select exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = ?) as exists",
      ['fleet_devices'],
    );

    if (!this.toBoolean(existsRows[0]?.exists)) {
      return {
        totalDevices: 0,
        registeredDevices: 0,
        configuredDevices: 0,
        verifiedActiveDevices: 0,
        pendingConfigDevices: 0,
        onlineNowDevices: 0,
        assignableDevices: 0,
        assignedDevices: 0,
        activeDevices: 0,
        faultyDevices: 0,
      };
    }

    // Counts read lifecycle_status alone. The status column is a derived
    // projection of it, so an "or status = ..." arm double-counts any row where
    // the two have drifted apart.
    const rows = await connection.execute<CountRow[]>(
      `
        select
          count(*)::int as total_devices,
          count(*) filter (where lifecycle_status = 'registered')::int as registered_devices,
          count(*) filter (where lifecycle_status = 'configured')::int as configured_devices,
          count(*) filter (
            where lifecycle_status in ('verified_online', 'assignable', 'assigned')
          )::int as verified_active_devices,
          count(*) filter (
            where lifecycle_status in ('registered', 'config_pending', 'configured')
          )::int as pending_config_devices,
          count(*) filter (
            where last_seen is not null and last_seen >= now() - interval '15 minutes'
          )::int as online_now_devices,
          count(*) filter (where lifecycle_status = 'assignable')::int as assignable_devices,
          count(*) filter (where lifecycle_status = 'assigned')::int as assigned_devices,
          count(*) filter (
            where lifecycle_status in ('verified_online', 'assignable')
          )::int as active_devices,
          count(*) filter (where lifecycle_status = 'faulty')::int as faulty_devices
        from fleet_devices
      `,
    );

    const row = rows[0] ?? {};
    return {
      totalDevices: this.toNumber(row.total_devices),
      registeredDevices: this.toNumber(row.registered_devices),
      configuredDevices: this.toNumber(row.configured_devices),
      verifiedActiveDevices: this.toNumber(row.verified_active_devices),
      pendingConfigDevices: this.toNumber(row.pending_config_devices),
      onlineNowDevices: this.toNumber(row.online_now_devices),
      assignableDevices: this.toNumber(row.assignable_devices),
      assignedDevices: this.toNumber(row.assigned_devices),
      activeDevices: this.toNumber(row.active_devices),
      faultyDevices: this.toNumber(row.faulty_devices),
    };
  }

  private toNumber(value: unknown) {
    return Number(value ?? 0) || 0;
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
}
