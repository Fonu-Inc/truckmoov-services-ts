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
  SIM_PROVISIONING_REQUEST_REPOSITORY,
  type SimProvisioningRequestRepository,
} from './sim-provisioning-request.repository';
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

@Injectable()
export class SubmitSimProvisioningRequestUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_PROVISIONING_REQUEST_REPOSITORY)
    private readonly requestRepository: SimProvisioningRequestRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboardingRepository: TenantOnboardingRepository,
  ) {}

  async execute(
    accessToken: string,
    payload: {
      numberOfSims: number;
      dataLimitGb: number;
      preferredOperator: string;
      useCase?: string;
      notes?: string;
      deviceMappingEnabled?: boolean;
    },
  ) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors cannot submit SIM provisioning requests');
    }

    const onboarding = await this.onboardingRepository.findByTenantId(actor.tenantId);
    const tenantName = onboarding?.company.companyName ?? actor.tenantId;

    const now = new Date();
    const request = {
      id: randomUUID(),
      tenantId: actor.tenantId,
      tenantName,
      requestType: 'activation',
      numberOfSims: payload.numberOfSims,
      preferredOperator: payload.preferredOperator,
      requestedPlan: 'iot_basic',
      requestedDataLimitMb: Math.round(payload.dataLimitGb * 1024),
      deploymentTimeline: null,
      useCase: [payload.useCase, payload.notes].filter(Boolean).join('\n') || null,
      deviceMappingData: payload.deviceMappingEnabled
        ? [{ enabled: true }]
        : null,
      status: 'pending',
      approvedBy: null,
      approvedByName: null,
      approvedAt: null,
      rejectedReason: null,
      fonuRequestId: null,
      fonuResponse: null,
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
