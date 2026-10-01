import { Controller, Get, Headers, Inject, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Portals } from '@shared/access';
import { InternalCallerService, type IncomingHeaders } from './internal-caller.service';
import {
  BUNDLE_CARRIER_REPOSITORY,
  type BundleCarrierRepository,
  type StoredBundleCarrier,
} from './bundle-carrier.repository';
import {
  BUNDLE_CATALOG_REPOSITORY,
  type BundleCatalogRepository,
  type StoredBundleCatalog,
} from './bundle-catalog.repository';

function toCarrier(c: StoredBundleCarrier) {
  return { id: c.id, name: c.name, displayName: c.displayName, active: c.active };
}

function toBundle(b: StoredBundleCatalog) {
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    carrierId: b.carrierId,
    dataAmountGb: b.dataAmountGb,
    validityDays: b.validityDays,
    billingCycle: b.billingCycle,
    priceKobo: b.priceKobo,
    currency: b.currency,
    active: b.active,
  };
}

/**
 * The active carrier and data-bundle catalogue, for fleet.
 *
 * This is the one catalogue: it is what allocations charge the wallet against,
 * so fleet reads it here instead of keeping a copy that would price differently.
 */
@ApiExcludeController()
@Portals('service')
@Controller('internal/bundle-catalog')
export class InternalBundleCatalogController {
  constructor(
    @Inject(InternalCallerService) private readonly callers: InternalCallerService,
    @Inject(BUNDLE_CARRIER_REPOSITORY) private readonly carriers: BundleCarrierRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY) private readonly bundles: BundleCatalogRepository,
  ) {}

  @Get()
  async catalog(@Headers() headers: IncomingHeaders) {
    if (!(await this.callers.serviceFor(headers, ['fleet']))) {
      throw new UnauthorizedException('Invalid service token');
    }
    const [carriers, bundles] = await Promise.all([this.carriers.findAll(true), this.activeBundles()]);
    return {
      status: true,
      message: 'success',
      data: { carriers: carriers.map(toCarrier), bundles: bundles.map(toBundle) },
    };
  }

  // The repository pages by default; a partial catalogue would make valid bundles look unknown.
  private async activeBundles(): Promise<StoredBundleCatalog[]> {
    const first = await this.bundles.findAll({ activeOnly: true });
    if (first.total <= first.items.length) return first.items;
    return (await this.bundles.findAll({ activeOnly: true, limit: first.total })).items;
  }
}
