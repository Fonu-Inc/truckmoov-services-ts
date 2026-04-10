import { Inject, Injectable } from '@nestjs/common';
import {
  SYSTEM_DEVICE_CATALOG_STATUSES,
  SYSTEM_DEVICE_FEATURE_KEYS,
  SYSTEM_DEVICE_PROTOCOL_TYPES,
} from './device-model-catalog.repository';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';

@Injectable()
export class GetSystemDeviceCatalogReferenceDataUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(
      accessToken,
      this.tokenService,
      this.userRepository,
      {
        forbiddenMessage:
          'You are not permitted to view device catalog reference data',
      },
    );

    return {
      status: true,
      message: 'success',
      data: {
        protocolTypes: [...SYSTEM_DEVICE_PROTOCOL_TYPES],
        statuses: [...SYSTEM_DEVICE_CATALOG_STATUSES],
        featureOptions: [
          {
            key: SYSTEM_DEVICE_FEATURE_KEYS[0],
            label: 'OBD-II',
            description: 'Supports onboard diagnostics telemetry',
          },
          {
            key: SYSTEM_DEVICE_FEATURE_KEYS[1],
            label: 'Fuel',
            description: 'Supports fuel monitoring',
          },
          {
            key: SYSTEM_DEVICE_FEATURE_KEYS[2],
            label: 'SOS',
            description: 'Supports SOS or panic alerts',
          },
        ],
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
