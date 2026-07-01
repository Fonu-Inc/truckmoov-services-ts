import { Inject, Injectable } from "@nestjs/common";
import { CARRIER_REPOSITORY, type CarrierRepository } from "../../domain/repositories/carrier.repository";

@Injectable()
export class ListCarriersUseCase {
  constructor(@Inject(CARRIER_REPOSITORY) private readonly repo: CarrierRepository) {}

  async execute() {
    return this.repo.findAll();
  }
}
