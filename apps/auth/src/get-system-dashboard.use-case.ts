import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { Role } from "@shared/rbac";
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  ForbiddenError,
} from "./contexts/auth/session";
import { resolveActorUser } from "./contexts/auth/session/application/use-cases/support/resolve-actor-user";
import type { TokenService } from "./contexts/auth/session/domain/ports/token-service.port";
import type { UserRepository } from "./contexts/auth/session/domain/ports/user-repository.port";
import { getAuthOrm } from "./contexts/auth/session/infrastructure/persistence/auth-orm";
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from "./tenant-onboarding.repository";
import { SYSTEM_TENANT_ID } from "@shared/identity";

const SYSTEM_VIEWER_ROLES = new Set<string>([Role.SUPER_ADMIN, Role.SYSTEM_ADMIN]);
const UNAVAILABLE_METRICS = [
  "totalSimCards",
  "dataUsageTodayMb",
  "sensorGpsMessagesPerHour",
] as const;

type CountRow = { count?: number | string };
type ExistsRow = { exists?: boolean | number | string };

export type SystemDashboardData = {
  totalTenants: number;
  totalVehicles: number;
  totalDrivers: number;
  totalSensors: number;
  totalSimCards: number | null;
  dataUsageTodayMb: number | null;
  sensorGpsMessagesPerHour: number | null;
  unavailableMetrics: string[];
  generatedAt: string;
};

@Injectable()
export class GetSystemDashboardUseCase {
  constructor(
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly tenantOnboardingRepository: TenantOnboardingRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId !== SYSTEM_TENANT_ID || !SYSTEM_VIEWER_ROLES.has(actor.role)) {
      throw new ForbiddenError("You are not permitted to view the system dashboard");
    }

    const counts = this.config.persistence.backend === "in-memory"
      ? await this.getInMemoryCounts()
      : await this.getDatabaseCounts();

    const data: SystemDashboardData = {
      ...counts,
      totalSimCards: null,
      dataUsageTodayMb: null,
      sensorGpsMessagesPerHour: null,
      unavailableMetrics: [...UNAVAILABLE_METRICS],
      generatedAt: new Date().toISOString(),
    };

    return {
      status: true,
      message: "success",
      data,
    };
  }

  private async getInMemoryCounts() {
    const [users, onboardings] = await Promise.all([
      this.userRepository.findAll(),
      this.tenantOnboardingRepository.findAll(),
    ]);
    const tenantIds = new Set<string>([
      ...users
        .map((user) => user.tenantId)
        .filter((tenantId) => tenantId && tenantId !== SYSTEM_TENANT_ID),
      ...onboardings
        .map((onboarding) => onboarding.tenantId)
        .filter((tenantId) => tenantId && tenantId !== SYSTEM_TENANT_ID),
    ]);

    return {
      totalTenants: tenantIds.size,
      totalVehicles: 0,
      totalDrivers: 0,
      totalSensors: 0,
    };
  }

  private async getDatabaseCounts() {
    const orm = await getAuthOrm(this.config.db);
    const connection = orm.em.getConnection();
    const hasTenantOnboardingsTable = await this.tableExists(connection, "system_tenant_onboardings");

    const tenantCountQuery = hasTenantOnboardingsTable
      ? `
        select count(distinct tenant_id)::int as count
        from (
          select tenant_id from auth_users where tenant_id <> ?
          union
          select tenant_id from system_tenant_onboardings where tenant_id <> ?
        ) as tenants
      `
      : "select count(distinct tenant_id)::int as count from auth_users where tenant_id <> ?";

    const [tenantCountRows, vehicleCount, driverCount, sensorCount] = await Promise.all([
      connection.execute<CountRow[]>(
        tenantCountQuery,
        hasTenantOnboardingsTable
          ? [SYSTEM_TENANT_ID, SYSTEM_TENANT_ID]
          : [SYSTEM_TENANT_ID],
      ),
      this.countTable(connection, "fleet_vehicles"),
      this.countTable(connection, "fleet_drivers"),
      this.countTable(connection, "fleet_devices"),
    ]);

    return {
      totalTenants: this.toNumber(tenantCountRows[0]?.count),
      totalVehicles: vehicleCount,
      totalDrivers: driverCount,
      totalSensors: sensorCount,
    };
  }

  private async tableExists(
    connection: Awaited<ReturnType<typeof getAuthOrm>>["em"]["getConnection"] extends () => infer T ? T : never,
    tableName: string,
  ) {
    const existsRows = await connection.execute<ExistsRow[]>(
      "select exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = ?) as exists",
      [tableName],
    );

    return this.toBoolean(existsRows[0]?.exists);
  }

  private async countTable(
    connection: Awaited<ReturnType<typeof getAuthOrm>>["em"]["getConnection"] extends () => infer T ? T : never,
    tableName: string,
  ) {
    const existsRows = await connection.execute<ExistsRow[]>(
      "select exists(select 1 from information_schema.tables where table_schema = 'public' and table_name = ?) as exists",
      [tableName],
    );

    if (!this.toBoolean(existsRows[0]?.exists)) {
      return 0;
    }

    const rows = await connection.execute<CountRow[]>(
      `select count(*)::int as count from \"${tableName}\"`,
    );

    return this.toNumber(rows[0]?.count);
  }

  private toNumber(value: unknown) {
    return Number(value ?? 0) || 0;
  }

  private toBoolean(value: unknown) {
    return value === true
      || value === 1
      || value === "1"
      || value === "t"
      || value === "true";
  }
}
