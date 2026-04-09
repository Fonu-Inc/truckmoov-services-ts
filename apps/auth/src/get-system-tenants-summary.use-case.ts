import { Inject, Injectable } from "@nestjs/common";
import { ListSystemTenantsUseCase } from "./list-system-tenants.use-case";

@Injectable()
export class GetSystemTenantsSummaryUseCase {
  constructor(
    @Inject(ListSystemTenantsUseCase)
    private readonly listSystemTenantsUseCase: ListSystemTenantsUseCase,
  ) {}

  async execute(accessToken: string) {
    const tenants = await this.listSystemTenantsUseCase.list(accessToken, {});
    return {
      status: true,
      message: "success",
      data: {
        totalTenants: tenants.length,
        activeTenants: tenants.filter((tenant) => tenant.status === "active").length,
        monthlyRevenueNgn: tenants.reduce((sum, tenant) => sum + tenant.monthlyRevenueNgn, 0),
        totalVehicles: tenants.reduce((sum, tenant) => sum + tenant.vehicleCount, 0),
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
