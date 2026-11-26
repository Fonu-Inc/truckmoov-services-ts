import { Inject, Injectable, Logger } from '@nestjs/common';
import { ManageInstallationOrdersUseCases } from './contexts/installation';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { FleetFactsService } from './fleet-facts.service';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';

export class SystemDeviceWriteRefusedError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'SystemDeviceWriteRefusedError';
  }
}

/** Corrects a device record from the platform inventory. */
@Injectable()
export class UpdateSystemDeviceUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
  ) {}

  async execute(
    accessToken: string,
    deviceId: string,
    patch: {
      manufacturer?: string;
      model?: string;
      firmwareVersion?: string;
      protocol?: string;
      lifecycleStatus?: string;
      status?: string;
    },
  ) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to edit devices',
    });

    const body = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(body).length === 0) {
      throw new SystemDeviceWriteRefusedError(400, 'Nothing to change');
    }

    const result = await this.fleet.updateDevice(deviceId, body);
    if (!result.ok) throw new SystemDeviceWriteRefusedError(result.status, result.message);

    return { status: true, message: 'Device updated', data: result.device };
  }
}

/** Records that stock devices now belong to a tenant. */
@Injectable()
export class AssignSystemDevicesUseCase {
  private readonly logger = new Logger(AssignSystemDevicesUseCase.name);

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
    @Inject(ManageInstallationOrdersUseCases) private readonly installations: ManageInstallationOrdersUseCases,
  ) {}

  async execute(
    accessToken: string,
    tenantId: string,
    deviceIds: string[],
    notes?: string,
  ) {
    const actor = await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to assign devices',
    });

    const result = await this.fleet.assignDevicesToTenant(tenantId, deviceIds, notes);
    if (!result.ok) throw new SystemDeviceWriteRefusedError(result.status, result.message);

    // The devices are the tenant's now whatever happens next, so a failed fit must not fail the assignment.
    const bound = await this.installations
      .autoBindUnits(tenantId, { id: actor.id, email: actor.email, role: actor.role }, deviceIds)
      .catch((error) => {
        this.logger.warn(`auto_bind_units_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`);
        return [];
      });

    return {
      status: true,
      message: 'Devices assigned',
      data: { tenantId, updated: result.updated, bound },
    };
  }
}
