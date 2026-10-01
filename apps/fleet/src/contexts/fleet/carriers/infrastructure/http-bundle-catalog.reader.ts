import { Inject, Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import { type ServiceCaller, createServiceCaller } from "@shared/identity";
import type { BundleCatalog, Carrier, DataBundle } from "../domain/entities/carrier.entity";
import type { BundleCatalogReader } from "../domain/ports/bundle-catalog-reader.port";

type AuthCarrier = { id?: string; name?: string; displayName?: string; active?: boolean };

type AuthBundle = {
  id?: string;
  name?: string;
  carrierId?: string;
  dataAmountGb?: number;
  billingCycle?: string;
  priceKobo?: number;
  active?: boolean;
};

type AuthCatalogResponse = { data?: { carriers?: AuthCarrier[]; bundles?: AuthBundle[] } };

const MB_PER_GB = 1024;

function statusOf(active: boolean | undefined): string {
  return active === false ? "inactive" : "active";
}

function toCarrier(c: AuthCarrier): Carrier | null {
  if (!c.id || !c.name) return null;
  // Auth has no slug; its short name is the closest to fleet's code.
  return { id: c.id, name: c.displayName || c.name, code: c.name, status: statusOf(c.active) };
}

function toBundle(b: AuthBundle): DataBundle | null {
  if (!b.id || !b.carrierId || !b.name) return null;
  return {
    id: b.id,
    carrierId: b.carrierId,
    name: b.name,
    planType: b.billingCycle ?? "",
    dataAllowanceMb: Math.round(Number(b.dataAmountGb ?? 0) * MB_PER_GB),
    priceNgn: Number(b.priceKobo ?? 0) / 100,
    status: statusOf(b.active),
  };
}

function present<T>(value: T | null): value is T {
  return value !== null;
}

/** Reads the carrier and data-bundle catalogue that auth owns and charges against. */
@Injectable()
export class HttpBundleCatalogReader implements BundleCatalogReader {
  private readonly logger = new Logger(HttpBundleCatalogReader.name);
  private readonly caller: ServiceCaller;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    this.caller = createServiceCaller(config, "fleet");
  }

  async read(): Promise<BundleCatalog | null> {
    const headers = this.caller.headers("auth");
    if (!headers) return null;

    try {
      const response = await axios.get<AuthCatalogResponse>(
        `${this.config.auth.serviceUrl}/auth/internal/bundle-catalog`,
        { headers, timeout: 3000, validateStatus: () => true },
      );
      if (response.status !== 200) return null;
      return this.toCatalog(response.data);
    } catch (error) {
      this.logger.warn(`bundle_catalog_fetch_failed:${error instanceof Error ? error.message : "unknown"}`);
      return null;
    }
  }

  private toCatalog(body: AuthCatalogResponse): BundleCatalog | null {
    const { carriers, bundles } = body?.data ?? {};
    if (!Array.isArray(carriers) || !Array.isArray(bundles)) return null;
    return {
      carriers: carriers.map(toCarrier).filter(present),
      bundles: bundles.map(toBundle).filter(present),
    };
  }
}
