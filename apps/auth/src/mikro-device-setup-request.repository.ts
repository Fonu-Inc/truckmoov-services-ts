import { Injectable } from '@nestjs/common';
import type {
  DeviceSetupRequestFilters,
  DeviceSetupRequestRepository,
  StoredDeviceSetupRequest,
} from './device-setup-request.repository';

@Injectable()
export class MikroDeviceSetupRequestRepository implements DeviceSetupRequestRepository {
  async findAll(_filters?: DeviceSetupRequestFilters): Promise<StoredDeviceSetupRequest[]> {
    return [];
  }

  async findById(_id: string): Promise<StoredDeviceSetupRequest | null> {
    return null;
  }

  async save(_request: StoredDeviceSetupRequest): Promise<void> {}
}
