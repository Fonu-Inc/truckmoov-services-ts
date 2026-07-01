import type { Carrier } from "../entities/carrier.entity";

export interface CarrierRepository {
  findAll(): Promise<Carrier[]>;
}

export const CARRIER_REPOSITORY = Symbol("CARRIER_REPOSITORY");
