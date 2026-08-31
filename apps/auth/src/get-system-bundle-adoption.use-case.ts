import { Inject, Injectable } from '@nestjs/common';
import { ensureSystemActor } from './system-authz';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { TENANT_ONBOARDING_REPOSITORY, type TenantOnboardingRepository } from './tenant-onboarding.repository';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { BUNDLE_ALLOCATION_REPOSITORY, type BundleAllocationRepository } from './bundle-allocation.repository';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository } from './bundle-catalog.repository';
import { buildExport } from './export.helper';

type Filters = { search?: string; format?: 'csv' | 'xlsx' };
const HEADERS = ['Tenant', 'Tenant ID', 'SIMs', 'Active Bundles', 'Carriers', 'Monthly Spend (NGN)'];

@Injectable()
export class GetSystemBundleAdoptionUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY) private readonly onboardings: TenantOnboardingRepository,
    @Inject(SIM_REPOSITORY) private readonly sims: SimRepository,
    @Inject(BUNDLE_ALLOCATION_REPOSITORY) private readonly allocations: BundleAllocationRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly catalog: BundleCatalogRepository,
  ) {}

  async execute(accessToken: string, filters: Filters = {}) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);
    const [onboardings, sims, allocations, bundles] = await Promise.all([
      this.onboardings.findAll(),
      this.sims.findAll({ limit: 100_000 }),
      this.allocations.findAll({ limit: 100_000 }),
      this.catalog.findAll({ limit: 100_000 }),
    ]);
    const tenantNames = new Map(onboardings.map((o) => [o.tenantId, o.company.companyName]));
    const bundleById = new Map(bundles.items.map((b) => [b.id, b]));
    const simsByTenant = new Map<string, typeof sims.items>();
    for (const sim of sims.items) {
      if (!sim.tenantId) continue;
      const list = simsByTenant.get(sim.tenantId) ?? [];
      list.push(sim);
      simsByTenant.set(sim.tenantId, list);
    }
    type AdoptionRow = { tenantId: string; tenantName: string; simCount: number; activeBundleCount: number; carriers: Set<string>; monthlySpendNgn: number; lines: Array<Record<string, unknown>> };
    const rows = new Map<string, AdoptionRow>();
    for (const allocation of allocations.items) {
      const bundle = bundleById.get(allocation.bundleId);
      const row = rows.get(allocation.tenantId) ?? { tenantId: allocation.tenantId, tenantName: tenantNames.get(allocation.tenantId) ?? allocation.tenantId, simCount: simsByTenant.get(allocation.tenantId)?.length ?? 0, activeBundleCount: 0, carriers: new Set<string>(), monthlySpendNgn: 0, lines: [] };
      if (allocation.status === 'active') row.activeBundleCount += 1;
      if (bundle) {
        row.carriers.add(bundle.carrierId);
        row.monthlySpendNgn += bundle.priceKobo / 100 / (bundle.billingCycle === 'yearly' ? 12 : 1);
      }
      const sim = simsByTenant.get(allocation.tenantId)?.find((candidate) => candidate.msisdn === allocation.mobileNumber);
      row.lines.push({ mobileNumber: allocation.mobileNumber, iccid: sim?.iccid ?? null, vehicleId: sim?.vehicleId ?? null, bundleId: allocation.bundleId, bundleName: bundle?.name ?? null, carrier: bundle?.carrierId ?? sim?.carrier ?? null, status: allocation.status, dataUsedMb: allocation.dataUsedMb, dataTotalMb: allocation.dataTotalMb });
      rows.set(allocation.tenantId, row);
    }
    const search = filters.search?.trim().toLowerCase();
    const data = [...rows.values()].map((row) => ({ ...row, carriers: [...row.carriers].sort(), monthlySpendNgn: Math.round(row.monthlySpendNgn * 100) / 100 })).filter((row) => !search || JSON.stringify(row).toLowerCase().includes(search)).sort((a, b) => a.tenantName.localeCompare(b.tenantName));
    return { status: true, message: 'Bundle adoption retrieved', data: { total: data.length, items: data } };
  }

  async export(accessToken: string, filters: Filters = {}) {
    const result = await this.execute(accessToken, filters);
    const rows = result.data.items.map((row) => [row.tenantName, row.tenantId, row.simCount, row.activeBundleCount, row.carriers.join(', '), row.monthlySpendNgn.toFixed(2)]);
    const { buffer, contentType, ext } = await buildExport(filters.format ?? 'csv', HEADERS, rows, 'Bundle Adoption');
    return { buffer, contentType, ext, filename: `bundle-adoption-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${ext}` };
  }
}
