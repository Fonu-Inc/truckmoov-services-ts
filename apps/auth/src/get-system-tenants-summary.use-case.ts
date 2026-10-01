import { Inject, Injectable } from "@nestjs/common";
import { ListSystemTenantsUseCase } from "./list-system-tenants.use-case";
import { INVOICE_REPOSITORY, lagosDate, type InvoiceRepository } from "@auth/onboarding";
import { SIM_REPOSITORY, type SimRepository } from "./sim.repository";
import {
  ENFORCEMENT_QUERIES_REPOSITORY,
  type EnforcementQueriesRepository,
} from "./enforcement-queries.repository";
import {
  ENFORCEMENT_SETTINGS_REPOSITORY,
  type EnforcementSettingsRepository,
} from "./enforcement-settings.repository";

@Injectable()
export class GetSystemTenantsSummaryUseCase {
  constructor(
    @Inject(ListSystemTenantsUseCase)
    private readonly listSystemTenantsUseCase: ListSystemTenantsUseCase,
    @Inject(SIM_REPOSITORY)
    private readonly simRepository: SimRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepository: InvoiceRepository,
    @Inject(ENFORCEMENT_QUERIES_REPOSITORY)
    private readonly enforcementQueries: EnforcementQueriesRepository,
    @Inject(ENFORCEMENT_SETTINGS_REPOSITORY)
    private readonly enforcementSettings: EnforcementSettingsRepository,
  ) {}

  async execute(accessToken: string) {
    const today = lagosDate(new Date());
    const [tenants, simCountByStatus, overdueInvoices, grace] = await Promise.all([
      this.listSystemTenantsUseCase.list(accessToken, {}),
      this.simRepository.countByStatus(),
      this.invoiceRepository.countOverdue(today),
      this.graceCounts(today),
    ]);
    const totalSims = Object.values(simCountByStatus).reduce(
      (sum, count) => sum + count,
      0,
    );
    return {
      status: true,
      message: "success",
      data: {
        totalTenants: tenants.length,
        activeTenants: tenants.filter((tenant) => tenant.status === "active")
          .length,
        suspendedTenants: tenants.filter(
          (tenant) => tenant.status === "suspended",
        ).length,
        terminatedTenants: tenants.filter(
          (tenant) => tenant.status === "terminated",
        ).length,
        inactiveTenants: tenants.filter(
          (tenant) => tenant.status === "inactive",
        ).length,
        pendingTenants: tenants.filter((tenant) => tenant.status === "pending")
          .length,
        totalVehicles: tenants.reduce(
          (sum, tenant) => sum + tenant.vehicleCount,
          0,
        ),
        totalSims,
        overdueInvoices,
        inGraceTenants: grace.inGrace,
        pastGraceTenants: grace.pastGrace,
        monthlyRevenueNgn: tenants.reduce(
          (sum, tenant) => sum + tenant.monthlyRevenueNgn,
          0,
        ),
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private async graceCounts(today: string) {
    const { graceDays } = await this.enforcementSettings.get();
    return this.enforcementQueries.summary(graceDays, today);
  }
}
