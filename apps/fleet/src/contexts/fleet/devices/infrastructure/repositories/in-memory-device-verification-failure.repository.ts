import { Injectable } from "@nestjs/common";
import { scopeKey } from "../../domain/ports/installer-device-scope.port";
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

  async findByDevices(
    scope: Array<{ tenantId: string; deviceId: string }>,
  ): Promise<DeviceVerificationFailure[]> {
    const wanted = new Set(scope.map((entry) => scopeKey(entry.tenantId, entry.deviceId)));
    return this.entries
      .filter((entry) => wanted.has(scopeKey(entry.tenantId, entry.deviceId)))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
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
