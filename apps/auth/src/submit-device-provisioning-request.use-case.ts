import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  ForbiddenError,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  TENANT_DEVICE_PROVISIONING_REQUEST_REPOSITORY,
  type TenantDeviceProvisioningRequestRepository,
} from './tenant-device-provisioning-request.repository';

@Injectable()
export class SubmitDeviceProvisioningRequestUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TENANT_DEVICE_PROVISIONING_REQUEST_REPOSITORY)
    private readonly requestRepository: TenantDeviceProvisioningRequestRepository,
  ) {}

  async execute(
    accessToken: string,
    payload: {
      manufacturer: string;
      model: string;
      quantity: number;
      useCase?: string;
      requesterNotes?: string;
    },
  ) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors cannot submit device requests');
    }

    const now = new Date();
    const request = {
      id: randomUUID(),
      tenantId: actor.tenantId,
      manufacturer: payload.manufacturer,
      model: payload.model,
      quantity: payload.quantity,
      useCase: payload.useCase ?? null,
      requesterNotes: payload.requesterNotes ?? null,
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now,
    };

    await this.requestRepository.save(request);

    return {
      status: true,
      message: 'success',
      data: { requestId: request.id },
    };
  }
}
