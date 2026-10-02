import { Inject, Injectable } from '@nestjs/common';
import { BUNDLE_ALLOCATION_REPOSITORY, type BundleAllocationRepository } from './bundle-allocation.repository';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import type { SimUsageRepository, SimUsageTotals } from './sim-usage.repository';

@Injectable()
export class InMemorySimUsageRepository implements SimUsageRepository {
  private readonly snapshots = new Map<string, number>();

  constructor(
    @Inject(SIM_REPOSITORY) private readonly sims: SimRepository,
    @Inject(BUNDLE_ALLOCATION_REPOSITORY) private readonly allocations: BundleAllocationRepository,
  ) {}

  async currentTotals(): Promise<SimUsageTotals> {
    const { items } = await this.sims.findAll({ unpaged: true });
    return {
      totalUsageMb: items.reduce((sum, sim) => sum + sim.dataUsageMb, 0),
      simsCount: items.length,
    };
  }

  async saveSnapshot(day: string, totals: SimUsageTotals): Promise<void> {
    this.snapshots.set(day, totals.totalUsageMb);
  }

  async snapshotsBetween(fromDay: string, toDay: string): Promise<Map<string, number>> {
    return new Map([...this.snapshots].filter(([day]) => day >= fromDay && day <= toDay));
  }

  async totalBundleMbBought(): Promise<number> {
    const { items } = await this.allocations.findAll();
    return items.filter((item) => item.status !== 'cancelled').reduce((sum, item) => sum + item.dataTotalMb, 0);
  }
}
