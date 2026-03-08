import { Injectable } from "@nestjs/common";
import type { Driver } from "../../domain/entities/driver.entity";
import type { DriverRepository } from "../../domain/repositories/driver.repository";

@Injectable()
export class InMemoryDriverRepository implements DriverRepository {
  private readonly data = new Map<string, Driver>();

  async save(driver: Driver): Promise<void> {
    this.data.set(driver.id, driver);
  }

  async findAll(): Promise<Driver[]> {
    return Array.from(this.data.values());
  }

  async findById(id: string): Promise<Driver | null> {
    return this.data.get(id) ?? null;
  }

  async deleteById(id: string): Promise<void> {
    this.data.delete(id);
  }
}
