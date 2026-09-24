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
  type TenantConnectivity,
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

/** Only a job the installer completed, at the stage that waits on its devices. */
function assertConfirmable(order: StoredInstallationOrder, application: StoredOnboardingApplication): void {
  if (order.status !== 'completed') {
    throw new InstallationNotConfirmableError('The installer has not completed this installation yet');
  }
  if (application.stage !== 'connectivity_verification') {
    throw new InstallationNotConfirmableError(
      `An onboarding at the ${application.stage} stage cannot be confirmed`,
    );
  }
}

type Failure = {
  deviceId: string;
  imei: string | null;
  model: string;
  vehicleId: string | null;
  lastSeen: string | null;
  reason: string;
};

type JobConnectivity = { checked: number; reporting: number; failures: Failure[] };

function toFailure(device: DeviceConnectivity): Failure {
  return {
    deviceId: device.deviceId,
    imei: device.imei,
    model: `${device.manufacturer} ${device.model}`.trim(),
    vehicleId: device.assignedVehicleId,
    lastSeen: device.lastSeen,
    reason:
      device.verificationStatus === 'failed'
        ? 'Verification failed on site'
        : 'No signal received yet',
  };
}

function notFound(deviceId: string): Failure {
  return { deviceId, imei: null, model: '', vehicleId: null, lastSeen: null, reason: 'Device not found on this account' };
}

/** A job device fleet did not return counts as not reporting. */
function forJob(deviceIds: string[], answer: TenantConnectivity): JobConnectivity {
  const found = new Map(answer.devices.map((device) => [device.deviceId, device]));
  const failures = deviceIds.flatMap((id) => {
    const device = found.get(id);
    if (!device) return [notFound(id)];
    return device.reporting ? [] : [toFailure(device)];
  });
  return { checked: deviceIds.length, reporting: deviceIds.length - failures.length, failures };
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
   * The installer has completed the job; the platform checks whether its
   * devices are reporting.
   *
   * The completion is not the evidence. Every device fitted on this job has to
   * be reporting before the onboarding closes, because a fleet that looks live
   * on a screen and is silent on the road is the failure this gate exists to
   * prevent. Only the job's own devices are checked: others the tenant holds
   * say nothing about this installation.
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
    assertConfirmable(order, application);

    const deviceIds = (await this.orders.findAssignments(order.id)).flatMap((unit) =>
      unit.fleetDeviceId ? [unit.fleetDeviceId] : [],
    );
    if (deviceIds.length === 0) {
      return this.pending(order, null, 'No devices are registered against this installation yet.');
    }
    const answer = await this.connectivity.forDevices(order.tenantId, deviceIds);
    if (!answer) {
      // Could not ask, which is not the same as every device being silent. The
      // onboarding waits rather than closing on an answer nobody gave.
      return this.pending(order, null, 'Connectivity could not be checked.');
    }

    const job = forJob(deviceIds, answer);
    if (job.failures.length > 0) {
      return this.pending(order, job, `${job.failures.length} of ${job.checked} device(s) are not reporting.`);
    }

    await this.markFleetReady(application, new Date());
    this.logger.log(`fleet_ready:${order.orderNumber}:devices=${job.checked}`);

    return {
      status: true,
      message: 'Every device is reporting. Your fleet is ready.',
      data: {
        orderNumber: order.orderNumber,
        stage: 'fleet_ready' satisfies OnboardingStage,
        devicesChecked: job.checked,
        devicesReporting: job.reporting,
        failures: [],
      },
    };
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
    job: JobConnectivity | null,
    message: string,
  ) {
    return {
      status: true,
      message,
      data: {
        orderNumber: order.orderNumber,
        stage: 'connectivity_verification' satisfies OnboardingStage,
        devicesChecked: job?.checked ?? 0,
        devicesReporting: job?.reporting ?? 0,
        failures: job?.failures ?? [],
      },
    };
  }
}
