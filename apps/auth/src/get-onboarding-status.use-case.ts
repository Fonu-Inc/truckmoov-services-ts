import { Inject, Injectable } from '@nestjs/common';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  ForbiddenError,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from './contexts/onboarding/domain/onboarding-application.repository';
import { requestedDeviceCount } from './contexts/onboarding/domain/onboarding-application.support';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
} from './contexts/installation/domain/installation-order.repository';
import { INSTALLATION_SLOT_LABELS } from './contexts/installation/domain/installation-order';

@Injectable()
export class GetOnboardingStatusUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboardingRepository: TenantOnboardingRepository,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(INSTALLATION_ORDER_REPOSITORY)
    private readonly installationOrders: InstallationOrderRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors do not have onboarding status');
    }

    const onboarding = await this.onboardingRepository.findByTenantId(actor.tenantId);

    const isOnboarded = onboarding?.subscriptionActivatedAt != null;

    let onboardingStatus: 'pending' | 'in_progress' | 'completed' | 'rejected';
    if (!onboarding) {
      onboardingStatus = 'pending';
    } else if (isOnboarded) {
      onboardingStatus = 'completed';
    } else {
      onboardingStatus = 'in_progress';
    }

    // What the customer asked for during onboarding, so the tenant's device
    // page can show the request while it is still being installed. The fleet
    // tables only receive the vehicle and device at handover, which leaves
    // the request invisible for the whole installation phase otherwise.
    const application = await this.applications.findLatestByTenantId(
      actor.tenantId,
    );
    let applicationSummary = null;
    if (application) {
      const [vehicles, deviceRequests, order] = await Promise.all([
        this.applications.findVehiclesByApplicationId(application.id),
        this.applications.findDeviceRequestsByApplicationId(application.id),
        this.installationOrders.findByApplicationId(application.id),
      ]);

      applicationSummary = {
        id: application.id,
        reference: application.reference,
        status: application.status,
        stage: application.stage,
        submittedAt: application.submittedAt?.toISOString() ?? null,
        createdAt: application.createdAt.toISOString(),
        vehicleCount: vehicles.length,
        requestedDevices: requestedDeviceCount(deviceRequests),
        deviceRequests: deviceRequests.map((request) => ({
          id: request.id,
          quantity: request.quantity,
          useCase: request.useCase,
          notes: request.notes,
        })),
        installation: order
          ? {
              orderNumber: order.orderNumber,
              status: order.status,
              scheduledDate: order.scheduledDate.toISOString().slice(0, 10),
              timeSlot: order.timeSlot,
              timeSlotLabel: INSTALLATION_SLOT_LABELS[order.timeSlot],
            }
          : null,
      };
    }

    return {
      status: true,
      message: 'success',
      data: {
        tenantId: actor.tenantId,
        isOnboarded,
        onboardingStatus,
        planCode: onboarding?.subscription?.planCode ?? null,
        subscriptionStatus: onboarding?.status ?? null,
        application: applicationSummary,
      },
    };
  }
}
