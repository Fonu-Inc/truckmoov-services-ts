import { Injectable } from "@nestjs/common";
import type {
  DeviceVerificationFailure,
  DeviceVerificationFailureRepository,
} from "../../domain/repositories/device-verification-failure.repository";

@Injectable()
export class InMemoryDeviceVerificationFailureRepository
  implements DeviceVerificationFailureRepository
{
  private readonly entries: DeviceVerificationFailure[] = [];

  async append(failure: DeviceVerificationFailure): Promise<void> {
    this.entries.push(failure);
  }

  async findByDevice(
    deviceId: string,
    tenantId: string,
    limit: number,
  ): Promise<DeviceVerificationFailure[]> {
    return this.entries
      .filter((entry) => entry.deviceId === deviceId && entry.tenantId === tenantId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }
}
