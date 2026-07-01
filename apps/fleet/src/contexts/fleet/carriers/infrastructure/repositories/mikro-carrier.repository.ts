import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import type { Carrier } from "../../domain/entities/carrier.entity";
import type { CarrierRepository } from "../../domain/repositories/carrier.repository";
import { CarrierRecord, getFleetOrm } from "../../../shared/infrastructure/persistence/fleet-orm";

@Injectable()
export class MikroCarrierRepository implements CarrierRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findAll(): Promise<Carrier[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(CarrierRecord, { status: "active" }, { orderBy: { name: "asc" } });
    return records.map((r) => ({ id: r.id, name: r.name, code: r.code, status: r.status }));
  }
}
