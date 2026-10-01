import { Inject, Injectable } from "@nestjs/common";
import { ListSystemTenantsUseCase } from "./list-system-tenants.use-case";
import { INVOICE_REPOSITORY, lagosDate, type InvoiceRepository } from "@auth/onboarding";
import { SIM_REPOSITORY, type SimRepository } from "./sim.repository";

@Injectable()
export class GetSystemTenantsSummaryUseCase {
  constructor(
    @Inject(ListSystemTenantsUseCase)
    private readonly listSystemTenantsUseCase: ListSystemTenantsUseCase,
    @Inject(SIM_REPOSITORY)
    private readonly simRepository: SimRepository,
    @Inject(INVOICE_REPOSITORY)
    private readonly invoiceRepository: InvoiceRepository,
  ) {}

  async execute(accessToken: string) {
    const [tenants, simCountByStatus, overdueInvoices] = await Promise.all([
      this.listSystemTenantsUseCase.list(accessToken, {}),
      this.simRepository.countByStatus(),
      this.invoiceRepository.countOverdue(lagosDate(new Date())),
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
        monthlyRevenueNgn: tenants.reduce(
          (sum, tenant) => sum + tenant.monthlyRevenueNgn,
          0,
        ),
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
