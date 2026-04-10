import { Inject, Injectable } from '@nestjs/common';
import {
  DEVICE_MODEL_CATALOG_REPOSITORY,
  type DeviceModelCatalogRepository,
} from './device-model-catalog.repository';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SystemDeviceModelNotFoundError } from './system-device-model.errors';
import { ensureSystemActor } from './system-authz';

@Injectable()
export class DeleteSystemDeviceModelUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(DEVICE_MODEL_CATALOG_REPOSITORY)
    private readonly deviceModelCatalogRepository: DeviceModelCatalogRepository,
  ) {}

  async execute(accessToken: string, deviceModelId: string) {
    await ensureSystemActor(
      accessToken,
      this.tokenService,
      this.userRepository,
      {
        forbiddenMessage: 'You are not permitted to delete device models',
      },
    );

    const existing =
      await this.deviceModelCatalogRepository.findById(deviceModelId);
    if (!existing) {
      throw new SystemDeviceModelNotFoundError();
    }

    await this.deviceModelCatalogRepository.deleteById(deviceModelId);

    return {
      status: true,
      message: 'Device model deleted successfully',
      data: {
        id: deviceModelId,
        deleted: true,
      },
    };
  }
}
