import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { tableExists } from "@shared/db";
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
import { ListSystemTenantsUseCase } from "./list-system-tenants.use-case";
import { SYSTEM_TENANT_ID } from "@shared/identity";

const SYSTEM_VIEWER_ROLES = new Set<string>([Role.SUPER_ADMIN, Role.SYSTEM_ADMIN]);
const UNAVAILABLE_METRICS = [
  "totalSimCards",
  "dataUsageTodayMb",
  "sensorGpsMessagesPerHour",
] as const;

type CountRow = {
  total?: number | string;
  this_month?: number | string;
};
type DbConnection =
  Awaited<ReturnType<typeof getAuthOrm>>["em"]["getConnection"] extends () => infer T
    ? T
    : never;

export type SystemDashboardChanges = {
  totalTenants: number | null;
  activeTenants: number | null;
  totalVehicles: number | null;
  totalDrivers: number | null;
  totalDevices: number | null;
};

export type SystemDashboardData = {
  totalTenants: number;
  totalVehicles: number;
  totalDrivers: number;
  totalSensors: number;
  totalSimCards: number | null;
  dataUsageTodayMb: number | null;
  sensorGpsMessagesPerHour: number | null;
  changes: SystemDashboardChanges;
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
    @Inject(ListSystemTenantsUseCase)
    private readonly listSystemTenantsUseCase: ListSystemTenantsUseCase,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId !== SYSTEM_TENANT_ID || !SYSTEM_VIEWER_ROLES.has(actor.role)) {
      throw new ForbiddenError("You are not permitted to view the system dashboard");
    }

    // The dashboard and the Tenants page must agree on what a tenant is. The
    // list also includes tenant ids found only in settings, business info or
    // fleet rows, which the old auth_users/onboarding count missed.
    const tenants = await this.listSystemTenantsUseCase.list(accessToken, {});
    const fleet = this.config.persistence.backend === "in-memory"
      ? { vehicles: ZERO, drivers: ZERO, devices: ZERO }
      : await this.getFleetCounts();

    const monthStart = startOfCurrentMonth();
    const tenantsThisMonth = tenants.filter(
      (tenant) => toDate(tenant.createdAt) >= monthStart,
    ).length;
    const activeTenants = tenants.filter(
      (tenant) => tenant.status === "active",
    ).length;
    const activeThisMonth = tenants.filter(
      (tenant) =>
        tenant.status === "active" && toDate(tenant.createdAt) >= monthStart,
    ).length;

    const data: SystemDashboardData = {
      totalTenants: tenants.length,
      totalVehicles: fleet.vehicles.total,
      totalDrivers: fleet.drivers.total,
      totalSensors: fleet.devices.total,
      totalSimCards: null,
      dataUsageTodayMb: null,
      sensorGpsMessagesPerHour: null,
      changes: {
        totalTenants: monthOverMonthPercent(tenants.length, tenantsThisMonth),
        activeTenants: monthOverMonthPercent(activeTenants, activeThisMonth),
        totalVehicles: monthOverMonthPercent(
          fleet.vehicles.total,
          fleet.vehicles.thisMonth,
        ),
        totalDrivers: monthOverMonthPercent(
          fleet.drivers.total,
          fleet.drivers.thisMonth,
        ),
        totalDevices: monthOverMonthPercent(
          fleet.devices.total,
          fleet.devices.thisMonth,
        ),
      },
      unavailableMetrics: [...UNAVAILABLE_METRICS],
      generatedAt: new Date().toISOString(),
    };

    return {
      status: true,
      message: "success",
      data,
    };
  }

  private async getFleetCounts() {
    const orm = await getAuthOrm(this.config.db);
    const connection = orm.em.getConnection();
    const [vehicles, drivers, devices] = await Promise.all([
      this.countTableWithMonth(connection, "fleet_vehicles"),
      this.countTableWithMonth(connection, "fleet_drivers"),
      this.countTableWithMonth(connection, "fleet_devices"),
    ]);
    return { vehicles, drivers, devices };
  }

  private async countTableWithMonth(
    connection: DbConnection,
    tableName: string,
  ): Promise<{ total: number; thisMonth: number }> {
    if (!(await tableExists(connection, tableName))) {
      return { total: 0, thisMonth: 0 };
    }

    const rows = await connection.execute<CountRow[]>(
      `select
         count(*)::int as total,
         count(*) filter (where created_at >= date_trunc('month', now()))::int as this_month
       from "${tableName}"`,
    );
    return {
      total: this.toNumber(rows[0]?.total),
      thisMonth: this.toNumber(rows[0]?.this_month),
    };
  }

  private toNumber(value: unknown) {
    return Number(value ?? 0) || 0;
  }
}

const ZERO = { total: 0, thisMonth: 0 };

/**
 * The dashboard's "vs last month" figure. `total` is today's cumulative count
 * and `addedThisMonth` is what was created in the current calendar month, so
 * last month's closing total is `total - addedThisMonth`.
 */
export function monthOverMonthPercent(
  total: number,
  addedThisMonth: number,
): number | null {
  const previous = total - addedThisMonth;
  if (previous <= 0) return null;
  return Math.round((addedThisMonth / previous) * 100);
}

function startOfCurrentMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Dates from the tenant list are ISO strings; an unparseable one counts as today. */
function toDate(value: string): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
