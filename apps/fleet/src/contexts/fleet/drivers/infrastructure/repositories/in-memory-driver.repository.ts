import { Injectable } from "@nestjs/common";
import type { Driver } from "../../domain/entities/driver.entity";
import type {
  DriverFilters,
  DriverRepository,
} from "../../domain/repositories/driver.repository";

@Injectable()
export class InMemoryDriverRepository implements DriverRepository {
  private readonly data = new Map<string, Driver>();

  async save(driver: Driver): Promise<void> {
    this.data.set(driver.id, driver);
  }

  async findAll(filters: DriverFilters): Promise<Driver[]> {
    const query = filters?.query?.trim().toLowerCase();

    return Array.from(this.data.values()).filter((driver) => {
      if (driver.tenantId !== filters.tenantId) {
        return false;
      }
      if (filters?.status && driver.status !== filters.status) {
        return false;
      }
      if (
        filters?.assigned !== undefined
        && (filters.assigned ? !driver.assignedVehicleId : Boolean(driver.assignedVehicleId))
      ) {
        return false;
      }
      if (!query) {
        return true;
      }

      return [
        driver.id,
        driver.name,
        driver.phone,
        driver.email ?? "",
        driver.licenseNumber,
        driver.contactChannels.whatsappNumber ?? "",
        driver.contactChannels.smsNumber ?? "",
        driver.contactChannels.voiceNumber ?? "",
      ].some((value) => value.toLowerCase().includes(query));
    });
  }

  async findById(id: string, tenantId: string): Promise<Driver | null> {
    const driver = this.data.get(id);
    if (!driver || driver.tenantId !== tenantId) return null;
    return driver;
  }

  async findByIds(ids: string[], tenantId: string): Promise<Driver[]> {
    return ids.flatMap((id) => {
      const driver = this.data.get(id);
      return driver && driver.tenantId === tenantId ? [driver] : [];
    });
  }

  async findByLicenseNumber(licenseNumber: string, tenantId: string): Promise<Driver | null> {
    const normalizedLicense = licenseNumber.trim().toUpperCase();
    return (
      Array.from(this.data.values()).find(
        (driver) =>
          driver.licenseNumber === normalizedLicense
          && driver.tenantId === tenantId.trim(),
      ) ?? null
    );
  }

  async findByAssignedVehicleId(vehicleId: string, tenantId: string): Promise<Driver | null> {
    return (
      Array.from(this.data.values()).find(
        (driver) => driver.assignedVehicleId === vehicleId && driver.tenantId === tenantId,
      ) ?? null
    );
  }

  async findByWhatsappNumber(whatsappNumber: string, tenantId: string): Promise<Driver | null> {
    return (
      Array.from(this.data.values()).find(
        (d) => d.contactChannels.whatsappNumber === whatsappNumber && d.tenantId === tenantId,
      ) ?? null
    );
  }

  async findByNumbersAcrossTenants(numbers: string[], limit: number): Promise<Driver[]> {
    const wanted = new Set(numbers);
    return Array.from(this.data.values())
      .filter((driver) =>
        [
          driver.phone,
          driver.contactChannels.whatsappNumber,
          driver.contactChannels.smsNumber,
          driver.contactChannels.voiceNumber,
        ].some((number) => number !== null && number !== "" && wanted.has(number)),
      )
      .slice(0, limit);
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const driver = this.data.get(id);
    if (!driver || driver.tenantId !== tenantId) return;
    this.data.delete(id);
  }
}
