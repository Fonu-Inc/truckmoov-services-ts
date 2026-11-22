import { Inject, Injectable } from '@nestjs/common';
import { ensureSystemActor } from './system-authz';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { TENANT_ONBOARDING_REPOSITORY, type TenantOnboardingRepository } from './tenant-onboarding.repository';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import { BUNDLE_ALLOCATION_REPOSITORY, type BundleAllocationRepository, type StoredBundleAllocation } from './bundle-allocation.repository';
import { BUNDLE_CATALOG_REPOSITORY, type BundleCatalogRepository } from './bundle-catalog.repository';
import { buildExport } from './export.helper';

export const BUNDLE_TYPES = ['subscription', 'top_up'] as const;
export type BundleType = (typeof BUNDLE_TYPES)[number];

type Filters = { search?: string; bundleType?: BundleType; format?: 'csv' | 'xlsx' };
type Line = Record<string, unknown> & { kind: BundleType | null };
type AdoptionRow = { tenantId: string; tenantName: string; simCount: number; activeBundleCount: number; carriers: string[]; monthlySpendNgn: number; lines: Line[] };

const HEADERS = ['Tenant', 'Tenant ID', 'SIMs', 'Active Bundles', 'Carriers', 'Monthly Spend (NGN)'];
const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Of the bundles live on one mobile number, the first one bought is its subscription and each one
 * added on top of it is a top-up. Nothing stored says which is which, so this is read from the order.
 */
function kindsByAllocation(allocations: StoredBundleAllocation[]): Map<string, BundleType> {
  const live = new Map<string, StoredBundleAllocation[]>();
  for (const a of allocations.filter((x) => x.status === 'active')) {
    const key = `${a.tenantId}:${a.mobileNumber}`;
    live.set(key, [...(live.get(key) ?? []), a]);
  }
  const kinds = new Map<string, BundleType>();
  for (const list of live.values()) {
    list
      .sort((a, b) => (a.activatedAt ?? a.createdAt).getTime() - (b.activatedAt ?? b.createdAt).getTime())
      .forEach((a, i) => kinds.set(a.id, i === 0 ? 'subscription' : 'top_up'));
  }
  return kinds;
}

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

  async execute(accessToken: string, filters: Filters = {}, now = new Date()) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);
    const { rows } = await this.adoption(now);
    const search = filters.search?.trim().toLowerCase();
    const data = rows
      .filter((row) => !filters.bundleType || row.lines.some((line) => line.kind === filters.bundleType))
      .filter((row) => !search || JSON.stringify(row).toLowerCase().includes(search))
      .sort((a, b) => a.tenantName.localeCompare(b.tenantName));
    return { status: true, message: 'Bundle adoption retrieved', data: { total: data.length, items: data } };
  }

  /** The four figures above the bundle tables. */
  async summary(accessToken: string, now = new Date()) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository);
    const { rows, allocations, bundles } = await this.adoption(now);
    const horizon = now.getTime() + 7 * DAY_MS;
    return {
      status: true,
      message: 'Bundle summary retrieved',
      data: {
        totalActiveBundles: bundles.filter((b) => b.active).length,
        expiringIn7Days: allocations.filter((a) => a.status === 'active' && a.expiresAt && a.expiresAt.getTime() >= now.getTime() && a.expiresAt.getTime() <= horizon).length,
        simsAcrossTenants: rows.reduce((sum, row) => sum + row.simCount, 0),
        monthlyBundleSpendNgn: round2(rows.reduce((sum, row) => sum + row.monthlySpendNgn, 0)),
      },
    };
  }

  async export(accessToken: string, filters: Filters = {}) {
    const result = await this.execute(accessToken, filters);
    const rows = result.data.items.map((row) => [row.tenantName, row.tenantId, row.simCount, row.activeBundleCount, row.carriers.join(', '), row.monthlySpendNgn.toFixed(2)]);
    const { buffer, contentType, ext } = await buildExport(filters.format ?? 'csv', HEADERS, rows, 'Bundle Adoption');
    return { buffer, contentType, ext, filename: `bundle-adoption-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${ext}` };
  }

  private async adoption(now: Date) {
    const [onboardings, sims, allocations, bundles] = await Promise.all([
      this.onboardings.findAll(),
      this.sims.findAll({ limit: 100_000 }),
      this.allocations.findAll({ limit: 100_000 }),
      this.catalog.findAll({ limit: 100_000 }),
    ]);
    const tenantNames = new Map(onboardings.map((o) => [o.tenantId, o.company.companyName]));
    const bundleById = new Map(bundles.items.map((b) => [b.id, b]));
    const kinds = kindsByAllocation(allocations.items);
    const simsByTenant = new Map<string, typeof sims.items>();
    for (const sim of sims.items) {
      if (!sim.tenantId) continue;
      simsByTenant.set(sim.tenantId, [...(simsByTenant.get(sim.tenantId) ?? []), sim]);
    }

    const rows = new Map<string, AdoptionRow & { carrierSet: Set<string> }>();
    for (const allocation of allocations.items) {
      const bundle = bundleById.get(allocation.bundleId);
      const row = rows.get(allocation.tenantId) ?? { tenantId: allocation.tenantId, tenantName: tenantNames.get(allocation.tenantId) ?? allocation.tenantId, simCount: simsByTenant.get(allocation.tenantId)?.length ?? 0, activeBundleCount: 0, carrierSet: new Set<string>(), carriers: [], monthlySpendNgn: 0, lines: [] };
      const active = allocation.status === 'active';
      if (active) row.activeBundleCount += 1;
      if (bundle) {
        row.carrierSet.add(bundle.carrierId);
        // Spend is what the live bundles cost per month; an expired one no longer costs anything.
        if (active) row.monthlySpendNgn += bundle.priceKobo / 100 / (bundle.billingCycle === 'yearly' ? 12 : 1);
      }
      const sim = simsByTenant.get(allocation.tenantId)?.find((candidate) => candidate.msisdn === allocation.mobileNumber);
      const expiresAt = allocation.expiresAt;
      row.lines.push({
        mobileNumber: allocation.mobileNumber,
        iccid: sim?.iccid ?? null,
        vehicleId: sim?.vehicleId ?? null,
        bundleId: allocation.bundleId,
        bundleName: bundle?.name ?? null,
        carrier: bundle?.carrierId ?? sim?.carrier ?? null,
        status: allocation.status,
        dataUsedMb: allocation.dataUsedMb,
        dataTotalMb: allocation.dataTotalMb,
        kind: kinds.get(allocation.id) ?? null,
        priceNgn: bundle ? bundle.priceKobo / 100 : null,
        expiresAt: expiresAt?.toISOString() ?? null,
        expiresInDays: expiresAt && expiresAt.getTime() > now.getTime() ? Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS) : null,
      });
      rows.set(allocation.tenantId, row);
    }

    return {
      rows: [...rows.values()].map(({ carrierSet, ...row }) => ({ ...row, carriers: [...carrierSet].sort(), monthlySpendNgn: round2(row.monthlySpendNgn) })),
      allocations: allocations.items,
      bundles: bundles.items,
    };
  }
}
