import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import type { DataBundle } from "../../domain/entities/carrier.entity";
import type { DataBundleFilters, DataBundleRepository } from "../../domain/repositories/data-bundle.repository";
import { DataBundleRecord, getFleetOrm } from "../../../shared/infrastructure/persistence/fleet-orm";

@Injectable()
export class MikroDataBundleRepository implements DataBundleRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findAll(filters?: DataBundleFilters): Promise<DataBundle[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      DataBundleRecord,
      { status: "active", ...(filters?.carrierId ? { carrierId: filters.carrierId } : {}) },
      { orderBy: { name: "asc" } },
    );
    return records.map((r) => ({
      id: r.id,
      carrierId: r.carrierId,
      name: r.name,
      planType: r.planType,
      dataAllowanceMb: r.dataAllowanceMb,
      priceNgn: Number(r.priceNgn),
      status: r.status,
    }));
  }
}
