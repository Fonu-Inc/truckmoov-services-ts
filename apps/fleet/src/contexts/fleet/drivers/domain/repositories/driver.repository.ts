import type { Driver } from "../entities/driver.entity";

export interface DriverRepository {
  save(driver: Driver): Promise<void>;
  findAll(): Promise<Driver[]>;
  findById(id: string): Promise<Driver | null>;
  deleteById(id: string): Promise<void>;
}

export const DRIVER_REPOSITORY = Symbol("DRIVER_REPOSITORY");
