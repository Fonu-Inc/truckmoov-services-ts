import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
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
import {
  DEVICE_MAPPING_FILE_REPOSITORY,
  type DeviceMappingFileRepository,
} from './device-mapping-file.repository';
import {
  BUNDLE_CATALOG_REPOSITORY,
  type BundleCatalogRepository,
} from './bundle-catalog.repository';

@Injectable()
export class SubmitTenantSimRequestUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_PROVISIONING_REQUEST_REPOSITORY)
    private readonly simProvisioningRequestRepository: SimProvisioningRequestRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly tenantOnboardingRepository: TenantOnboardingRepository,
    @Inject(DEVICE_MAPPING_FILE_REPOSITORY)
    private readonly deviceMappingFileRepository: DeviceMappingFileRepository,
    @Inject(BUNDLE_CATALOG_REPOSITORY)
    private readonly bundleCatalogRepository: BundleCatalogRepository,
  ) {}

  async execute(
    accessToken: string,
    payload: {
      quantity: number;
      carrier: string;
      planType: string;
      dataBundlePlanId: string;
      useCase?: string;
      notes?: string;
      deviceMappingFileId?: string;
    },
  ) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot submit SIM requests');

    const onboarding = await this.tenantOnboardingRepository.findByTenantId(actor.tenantId);
    const tenantName = onboarding?.company.companyName ?? actor.tenantId;

    const bundle = await this.bundleCatalogRepository.findById(payload.dataBundlePlanId);

    let deviceMappingData: Record<string, unknown>[] | null = null;
    if (payload.deviceMappingFileId) {
      deviceMappingData = [{ fileId: payload.deviceMappingFileId }];
    }

    const now = new Date();
    const id = randomUUID();

    await this.simProvisioningRequestRepository.save({
      id,
      tenantId: actor.tenantId,
      tenantName,
      requestType: 'activation',
      numberOfSims: payload.quantity,
      preferredOperator: payload.carrier,
      requestedPlan: payload.planType,
      requestedDataLimitMb: bundle ? bundle.dataAmountGb * 1024 : 0,
      deploymentTimeline: null,
      useCase: (payload.useCase ?? '') + (payload.notes ? '\n' + payload.notes : ''),
      deviceMappingData,
      status: 'pending',
      approvedBy: null,
      approvedByName: null,
      approvedAt: null,
      rejectedReason: null,
      fonuRequestId: null,
      fonuResponse: null,
      createdAt: now,
      updatedAt: now,
    });

    return { status: true, message: 'success', data: { requestId: id } };
  }
}
