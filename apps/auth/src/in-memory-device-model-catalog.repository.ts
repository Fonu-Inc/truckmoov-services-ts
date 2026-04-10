import { Injectable } from '@nestjs/common';
import {
  type DeviceModelCatalogRepository,
  type StoredSystemDeviceModel,
} from './device-model-catalog.repository';

@Injectable()
export class InMemoryDeviceModelCatalogRepository implements DeviceModelCatalogRepository {
  private readonly store = new Map<string, StoredSystemDeviceModel>();

  async save(model: StoredSystemDeviceModel): Promise<void> {
    this.store.set(model.id, model);
  }

  async findById(id: string): Promise<StoredSystemDeviceModel | null> {
    return this.store.get(id) ?? null;
  }

  async findByManufacturerAndModel(
    manufacturer: string,
    model: string,
  ): Promise<StoredSystemDeviceModel | null> {
    const normalizedManufacturer = manufacturer.trim().toLowerCase();
    const normalizedModel = model.trim().toLowerCase();
    for (const entry of this.store.values()) {
      if (
        entry.manufacturer.trim().toLowerCase() === normalizedManufacturer &&
        entry.model.trim().toLowerCase() === normalizedModel
      ) {
        return entry;
      }
    }
    return null;
  }

  async findAll(): Promise<StoredSystemDeviceModel[]> {
    return [...this.store.values()].sort((left, right) => {
      const manufacturerSort = left.manufacturer.localeCompare(
        right.manufacturer,
      );
      if (manufacturerSort !== 0) {
        return manufacturerSort;
      }
      return left.model.localeCompare(right.model);
    });
  }

  async deleteById(id: string): Promise<void> {
    this.store.delete(id);
  }
}
