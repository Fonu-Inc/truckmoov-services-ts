import { Inject, Injectable } from "@nestjs/common";
import { DATA_BUNDLE_REPOSITORY, type DataBundleFilters, type DataBundleRepository } from "../../domain/repositories/data-bundle.repository";

@Injectable()
export class ListDataBundlesUseCase {
  constructor(@Inject(DATA_BUNDLE_REPOSITORY) private readonly repo: DataBundleRepository) {}

  async execute(filters?: DataBundleFilters) {
    return this.repo.findAll(filters);
  }
}
