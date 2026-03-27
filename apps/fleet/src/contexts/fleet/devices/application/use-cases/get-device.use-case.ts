import { Inject, Injectable } from "@nestjs/common";
import { DeviceNotFoundError } from "../../domain/errors/device-not-found.error";
import { DEVICE_REPOSITORY, type DeviceRepository } from "../../domain/repositories/device.repository";

@Injectable()
export class GetDeviceUseCase {
  constructor(
    @Inject(DEVICE_REPOSITORY)
    private readonly deviceRepository: DeviceRepository,
  ) {}

  async execute(id: string) {
    const device = await this.deviceRepository.findById(id);
    if (!device) {
      throw new DeviceNotFoundError(id);
    }

    return device.toPrimitives();
  }
}
