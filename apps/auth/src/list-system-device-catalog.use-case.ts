import { Inject, Injectable } from '@nestjs/common';
import {
  DEVICE_MODEL_CATALOG_REPOSITORY,
  type DeviceModelCatalogRepository,
  type StoredSystemDeviceModel,
} from './device-model-catalog.repository';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import { toSystemDeviceModelResponse } from './system-device-model.presenter';

export type SystemDeviceCatalogFilters = {
  search?: string;
  status?: 'supported' | 'deprecated' | 'blocked';
};

export type SystemDeviceCatalogRow = ReturnType<
  typeof toSystemDeviceModelResponse
>;

@Injectable()
export class ListSystemDeviceCatalogUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(DEVICE_MODEL_CATALOG_REPOSITORY)
    private readonly deviceModelCatalogRepository: DeviceModelCatalogRepository,
  ) {}

  async execute(accessToken: string, filters: SystemDeviceCatalogFilters = {}) {
    const models = await this.list(accessToken, filters);
    return {
      status: true,
      message: 'success',
      data: {
        total: models.length,
        models,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async list(
    accessToken: string,
    filters: SystemDeviceCatalogFilters = {},
  ): Promise<SystemDeviceCatalogRow[]> {
    await ensureSystemActor(
      accessToken,
      this.tokenService,
      this.userRepository,
      {
        forbiddenMessage: 'You are not permitted to view the device catalog',
      },
    );

    const search = filters.search?.trim().toLowerCase();
    const models = await this.deviceModelCatalogRepository.findAll();
    return models
      .filter((entry) => {
        const matchesSearch =
          !search ||
          entry.manufacturer.toLowerCase().includes(search) ||
          entry.model.toLowerCase().includes(search);
        const matchesStatus =
          !filters.status || entry.status === filters.status;
        return matchesSearch && matchesStatus;
      })
      .map((entry) => toSystemDeviceModelResponse(entry));
  }
}
