import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  BUNDLE_CARRIER_REPOSITORY,
  type BundleCarrierRepository,
  type StoredBundleCarrier,
} from '../../bundle-carrier.repository';
import {
  BUNDLE_CATALOG_REPOSITORY,
  type BundleCatalogRepository,
  type StoredBundleCatalog,
} from '../../bundle-catalog.repository';
import { MtnM2mClient } from './mtn-m2m.client';
import {
  mapMtnProduct,
  MTN_BUNDLE_ID_PREFIX,
  MTN_CARRIER_ID,
} from './mtn-bundle-catalog.mapper';

export type MtnBundleSyncSummary = {
  fetched: number;
  created: number;
  updated: number;
  deactivated: number;
  skipped: number;
};

/**
 * Pulls MTN's M2M product catalogue into the local `bundle_catalog`.
 *
 * The database stays the source of truth for allocations and charging; this
 * only refreshes the MTN-owned rows. Rows are keyed by product id so a second
 * sync updates in place, and a product that disappears from MTN is deactivated
 * rather than deleted because allocations may still reference it.
 */
@Injectable()
export class MtnBundleCatalogSyncService {
  private readonly logger = new Logger(MtnBundleCatalogSyncService.name);

  private readonly productMatch: RegExp;

  constructor(
    @Inject(MtnM2mClient) private readonly mtn: MtnM2mClient,
    @Inject(BUNDLE_CARRIER_REPOSITORY)
    private readonly carriers: BundleCarrierRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY)
    private readonly bundles: BundleCatalogRepository,
    @Inject(AppConfigService) config: AppConfigService,
  ) {
    try {
      this.productMatch = new RegExp(config.mtn.productMatch, 'i');
    } catch {
      this.logger.warn(
        `mtn_bundle_sync:invalid_product_match:${config.mtn.productMatch}`,
      );
      this.productMatch = /m2m|machine/i;
    }
  }

  async sync(now: Date = new Date()): Promise<MtnBundleSyncSummary> {
    const products = await this.mtn.listProducts();
    const carrier = await this.ensureMtnCarrier(now);
    const existing = await this.allBundlesFor(carrier.id);
    const byId = new Map(existing.map((bundle) => [bundle.id, bundle]));
    const byCode = new Map(existing.map((bundle) => [bundle.code, bundle]));

    const summary: MtnBundleSyncSummary = {
      fetched: products.length,
      created: 0,
      updated: 0,
      deactivated: 0,
      skipped: 0,
    };
    const seen = new Set<string>();

    for (const product of products) {
      const mapped = mapMtnProduct(product, this.productMatch);
      if (!mapped) {
        summary.skipped += 1;
        continue;
      }

      const prior = byId.get(mapped.id) ?? byCode.get(mapped.code);
      const row: StoredBundleCatalog = {
        ...mapped,
        carrierId: carrier.id,
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
      };
      await this.bundles.save(row);
      seen.add(row.id);
      if (prior) summary.updated += 1;
      else summary.created += 1;
    }

    // An empty catalogue is far more likely to be an MTN outage than a real
    // deletion of every product. Only prune after a non-empty, successful read.
    if (seen.size > 0) {
      for (const bundle of existing) {
        if (!bundle.id.startsWith(MTN_BUNDLE_ID_PREFIX)) continue;
        if (seen.has(bundle.id) || !bundle.active) continue;
        await this.bundles.save({ ...bundle, active: false, updatedAt: now });
        summary.deactivated += 1;
      }
    }

    this.logger.log(`mtn_bundle_sync:${JSON.stringify(summary)}`);
    return summary;
  }

  private async ensureMtnCarrier(now: Date): Promise<StoredBundleCarrier> {
    const carriers = await this.carriers.findAll();
    const existing = carriers.find(
      (carrier) =>
        carrier.id === MTN_CARRIER_ID ||
        carrier.name.trim().toLowerCase() === 'mtn' ||
        carrier.displayName.trim().toLowerCase() === 'mtn',
    );
    if (existing) return existing;

    const carrier: StoredBundleCarrier = {
      id: MTN_CARRIER_ID,
      name: 'MTN',
      displayName: 'MTN',
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    await this.carriers.save(carrier);
    return carrier;
  }

  private async allBundlesFor(carrierId: string): Promise<StoredBundleCatalog[]> {
    const first = await this.bundles.findAll({
      carrierId,
      page: 1,
      limit: 1000,
    });
    if (first.total <= first.items.length) return first.items;
    return (await this.bundles.findAll({
      carrierId,
      page: 1,
      limit: first.total,
    })).items;
  }
}
