import { Inject, Injectable } from '@nestjs/common';
import {
  DEVICE_MODEL_CATALOG_REPOSITORY,
  type DeviceModelCatalogRepository,
  type SystemDeviceFeatureKey,
  type SystemDeviceProtocolType,
} from './device-model-catalog.repository';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  SystemDeviceModelConflictError,
  SystemDeviceModelNotFoundError,
} from './system-device-model.errors';
import { ensureSystemActor } from './system-authz';

export type UpdateSystemDeviceModelCommand = {
  accessToken: string;
  deviceModelId: string;
  manufacturer?: string;
  model?: string;
  protocolType?: SystemDeviceProtocolType;
  defaultPort?: number | null;
  supportedFeatures?: SystemDeviceFeatureKey[];
  status?: 'supported' | 'deprecated' | 'blocked';
  configurationInstructions?: string | null;
};

@Injectable()
export class UpdateSystemDeviceModelUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(DEVICE_MODEL_CATALOG_REPOSITORY)
    private readonly deviceModelCatalogRepository: DeviceModelCatalogRepository,
  ) {}

  async execute(command: UpdateSystemDeviceModelCommand) {
    await ensureSystemActor(
      command.accessToken,
      this.tokenService,
      this.userRepository,
      {
        forbiddenMessage: 'You are not permitted to update device models',
      },
    );

    const existing = await this.deviceModelCatalogRepository.findById(
      command.deviceModelId,
    );
    if (!existing) {
      throw new SystemDeviceModelNotFoundError();
    }

    const nextManufacturer =
      command.manufacturer?.trim() || existing.manufacturer;
    const nextModel = command.model?.trim() || existing.model;
    const conflict =
      await this.deviceModelCatalogRepository.findByManufacturerAndModel(
        nextManufacturer,
        nextModel,
      );
    if (conflict && conflict.id !== existing.id) {
      throw new SystemDeviceModelConflictError();
    }

    const updated = {
      ...existing,
      manufacturer: nextManufacturer,
      model: nextModel,
      protocolType: command.protocolType ?? existing.protocolType,
      defaultPort:
        command.defaultPort === undefined
          ? existing.defaultPort
          : command.defaultPort,
      supportedFeatures:
        command.supportedFeatures === undefined
          ? existing.supportedFeatures
          : [...command.supportedFeatures],
      status: command.status ?? existing.status,
      configurationInstructions:
        command.configurationInstructions === undefined
          ? existing.configurationInstructions
          : command.configurationInstructions?.trim() || null,
      updatedAt: new Date(),
    };

    await this.deviceModelCatalogRepository.save(updated);

    return {
      status: true,
      message: 'Device model updated successfully',
      data: {
        id: updated.id,
        manufacturer: updated.manufacturer,
        model: updated.model,
        protocolType: updated.protocolType,
        defaultPort: updated.defaultPort,
        supportedFeatures: updated.supportedFeatures,
        status: updated.status,
        configurationInstructions: updated.configurationInstructions,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    };
  }
}
