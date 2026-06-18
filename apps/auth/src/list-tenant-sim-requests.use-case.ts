import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  SIM_PROVISIONING_REQUEST_REPOSITORY,
  type SimProvisioningRequestRepository,
  type StoredSimProvisioningRequest,
} from './sim-provisioning-request.repository';

function mapStatus(status: string): string {
  switch (status) {
    case 'pending': return 'pending_review';
    case 'approved': return 'approved';
    case 'rejected': return 'rejected';
    default: return 'fulfilled';
  }
}

function buildTimeline(req: StoredSimProvisioningRequest) {
  const timeline: Array<{ label: string; at: string; by?: string }> = [
    { label: 'Submitted', at: req.createdAt.toISOString() },
  ];
  if (req.approvedAt) {
    timeline.push({ label: 'Approved', at: req.approvedAt.toISOString(), by: req.approvedByName ?? undefined });
  }
  if (req.rejectedReason) {
    timeline.push({ label: 'Rejected', at: req.updatedAt.toISOString() });
  }
  return timeline;
}

function mapRequest(req: StoredSimProvisioningRequest) {
  return {
    id: req.id,
    quantity: req.numberOfSims,
    organizationName: req.tenantName,
    requestingEmail: '',
    carrier: req.preferredOperator,
    planType: req.requestedPlan,
    dataBundlePlan: {
      id: '',
      name: '',
      dataLimitGb: req.requestedDataLimitMb / 1024,
    },
    useCase: req.useCase ?? '',
    notes: undefined,
    status: mapStatus(req.status),
    createdAt: req.createdAt.toISOString(),
    timeline: buildTimeline(req),
  };
}

@Injectable()
export class ListTenantSimRequestsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_PROVISIONING_REQUEST_REPOSITORY)
    private readonly simProvisioningRequestRepository: SimProvisioningRequestRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot access tenant SIM requests');

    const all = await this.simProvisioningRequestRepository.findAll();
    const requests = all.filter((r) => r.tenantId === actor.tenantId);

    return {
      status: true,
      message: 'success',
      data: { items: requests.map(mapRequest), total: requests.length },
    };
  }
}
