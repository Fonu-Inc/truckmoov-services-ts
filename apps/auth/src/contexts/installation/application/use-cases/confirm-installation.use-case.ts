import { Inject, Injectable, Logger } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import { resolveActorUser } from '@auth/session/application/use-cases/support/resolve-actor-user';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import {
  assertStageAdvance,
  type OnboardingStage,
} from '@auth/onboarding/domain/onboarding-stage';
import {
  CONNECTIVITY_VERIFICATION,
  type ConnectivityVerification,
  type DeviceConnectivity,
} from '@auth/installation/domain/ports/connectivity-verification.port';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
  type StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';

export class NoInstallationOrderError extends Error {
  constructor() {
    super('No installation is scheduled for this account');
    this.name = 'NoInstallationOrderError';
  }
}

export class InstallationNotConfirmableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstallationNotConfirmableError';
  }
}

@Injectable()
export class ConfirmInstallationUseCase {
  private readonly logger = new Logger(ConfirmInstallationUseCase.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(INSTALLATION_ORDER_REPOSITORY)
    private readonly orders: InstallationOrderRepository,
    @Inject(CONNECTIVITY_VERIFICATION)
    private readonly connectivity: ConnectivityVerification,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  /**
   * The customer says the fitting is done; the platform checks whether it is.
   *
   * The confirmation is not the evidence. Every device has to be reporting
   * before the onboarding closes, because a fleet that looks live on a screen
   * and is silent on the road is the failure this gate exists to prevent.
   *
   * A device that is not reporting is named, so the customer knows which
   * vehicle to go back to rather than being told the fleet is not ready.
   */
  async execute(accessToken: string) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.users,
    );

    const order = await this.orders.findByTenantId(actor.tenantId);
    if (!order) throw new NoInstallationOrderError();

    const application = await this.applications.findById(order.applicationId);
    if (!application) throw new NoInstallationOrderError();

    const now = new Date();
    if (application.stage === 'installation') {
      await this.complete(order, application, now);
    } else if (application.stage !== 'connectivity_verification') {
      throw new InstallationNotConfirmableError(
        `An onboarding at the ${application.stage} stage cannot be confirmed`,
      );
    }

    const answer = await this.connectivity.forTenant(actor.tenantId);
    if (!answer) {
      // Could not ask, which is not the same as every device being silent. The
      // onboarding waits rather than closing on an answer nobody gave.
      return this.pending(order, [], 'Connectivity could not be checked.');
    }

    const silent = answer.devices.filter((device) => !device.reporting);
    if (silent.length > 0 || answer.total === 0) {
      return this.pending(
        order,
        silent,
        answer.total === 0
          ? 'No devices are registered against this account yet.'
          : `${silent.length} of ${answer.total} device(s) are not reporting.`,
      );
    }

    await this.markFleetReady(application, now);
    this.logger.log(`fleet_ready:${order.orderNumber}:devices=${answer.total}`);

    return {
      status: true,
      message: 'Every device is reporting. Your fleet is ready.',
      data: {
        orderNumber: order.orderNumber,
        stage: 'fleet_ready' satisfies OnboardingStage,
        devicesChecked: answer.total,
        devicesReporting: answer.reporting,
        failures: [],
      },
    };
  }

  private async complete(
    order: StoredInstallationOrder,
    application: StoredOnboardingApplication,
    now: Date,
  ): Promise<void> {
    await this.orders.save({
      ...order,
      status: 'completed',
      completedAt: now,
      updatedAt: now,
    });

    assertStageAdvance(application.stage, 'connectivity_verification');
    await this.applications.save({
      ...application,
      stage: 'connectivity_verification',
      updatedAt: now,
    });
  }

  private async markFleetReady(
    application: StoredOnboardingApplication,
    now: Date,
  ): Promise<void> {
    const current = await this.applications.findById(application.id);
    if (!current || current.stage !== 'connectivity_verification') return;

    assertStageAdvance(current.stage, 'fleet_ready');
    await this.applications.save({
      ...current,
      stage: 'fleet_ready',
      updatedAt: now,
    });
  }

  private pending(
    order: StoredInstallationOrder,
    silent: DeviceConnectivity[],
    message: string,
  ) {
    return {
      status: true,
      message,
      data: {
        orderNumber: order.orderNumber,
        stage: 'connectivity_verification' satisfies OnboardingStage,
        devicesChecked: silent.length,
        devicesReporting: 0,
        failures: silent.map((device) => ({
          deviceId: device.deviceId,
          imei: device.imei,
          model: `${device.manufacturer} ${device.model}`.trim(),
          vehicleId: device.assignedVehicleId,
          lastSeen: device.lastSeen,
          reason:
            device.verificationStatus === 'failed'
              ? 'Verification failed on site'
              : 'No signal received yet',
        })),
      },
    };
  }
}
