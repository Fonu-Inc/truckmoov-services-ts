import { Inject, Injectable } from '@nestjs/common';
import {
  DEVICE_MODEL_CATALOG_REPOSITORY,
  type DeviceModelCatalogRepository,
  type SystemDeviceFeatureKey,
  type SystemDeviceProtocolType,
} from './device-model-catalog.repository';
import {
  ID_GENERATOR,
  TOKEN_SERVICE,
  USER_REPOSITORY,
} from './contexts/auth/session';
import type { IdGenerator } from './contexts/auth/session/domain/ports/id-generator.port';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SystemDeviceModelConflictError } from './system-device-model.errors';
import { ensureSystemActor } from './system-authz';

export type CreateSystemDeviceModelCommand = {
  accessToken: string;
  manufacturer: string;
  model: string;
  protocolType: SystemDeviceProtocolType;
  defaultPort?: number | null;
  supportedFeatures: SystemDeviceFeatureKey[];
  status: 'supported' | 'deprecated' | 'blocked';
  configurationInstructions?: string | null;
};

@Injectable()
export class CreateSystemDeviceModelUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
    @Inject(DEVICE_MODEL_CATALOG_REPOSITORY)
    private readonly deviceModelCatalogRepository: DeviceModelCatalogRepository,
  ) {}

  async execute(command: CreateSystemDeviceModelCommand) {
    const actor = await ensureSystemActor(
      command.accessToken,
      this.tokenService,
      this.userRepository,
      {
        forbiddenMessage: 'You are not permitted to create device models',
      },
    );

    const manufacturer = command.manufacturer.trim();
    const model = command.model.trim();
    const existing =
      await this.deviceModelCatalogRepository.findByManufacturerAndModel(
        manufacturer,
        model,
      );
    if (existing) {
      throw new SystemDeviceModelConflictError();
    }

    const now = new Date();
    const deviceModel = {
      id: this.idGenerator.generate(),
      manufacturer,
      model,
      protocolType: command.protocolType,
      defaultPort: command.defaultPort ?? null,
      supportedFeatures: [...command.supportedFeatures],
      status: command.status,
      configurationInstructions:
        command.configurationInstructions?.trim() || null,
      createdByUserId: actor.id,
      createdAt: now,
      updatedAt: now,
    };

    await this.deviceModelCatalogRepository.save(deviceModel);

    return {
      status: true,
      message: 'Device model created successfully',
      data: {
        id: deviceModel.id,
        manufacturer: deviceModel.manufacturer,
        model: deviceModel.model,
        protocolType: deviceModel.protocolType,
        defaultPort: deviceModel.defaultPort,
        supportedFeatures: deviceModel.supportedFeatures,
        status: deviceModel.status,
        configurationInstructions: deviceModel.configurationInstructions,
        createdAt: deviceModel.createdAt.toISOString(),
        updatedAt: deviceModel.updatedAt.toISOString(),
      },
    };
  }
}
