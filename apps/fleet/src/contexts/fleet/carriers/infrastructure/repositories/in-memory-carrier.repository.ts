import { Injectable } from "@nestjs/common";
import type { Carrier } from "../../domain/entities/carrier.entity";
import type { CarrierRepository } from "../../domain/repositories/carrier.repository";
import { SEED_CARRIERS } from "./seed-catalog";

@Injectable()
export class InMemoryCarrierRepository implements CarrierRepository {
  async findAll(): Promise<Carrier[]> {
    return SEED_CARRIERS;
  }
}
