import { Inject, Injectable, Logger } from '@nestjs/common';
import { TOKEN_SERVICE } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { assertStageAdvance } from '@auth/onboarding/domain/onboarding-stage';
import { START_SOURCE_STATUSES, transitionOrder } from '@auth/installation/domain/installation-order';
import {
  CHECKLIST_GATES,
  CHECKLIST_ITEMS,
  isChecklistComplete,
} from '@auth/installation/domain/installation-checklist';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
  type StoredDeviceAssignment,
  type StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
} from '@auth/installation/domain/installer.repository';
import {
  InstallationJobConflictError,
  InstallationJobNotFoundError,
} from '@auth/installation/domain/installation-job.errors';
import {
  JOB_DEVICE_LOOKUP,
  type JobDeviceLookup,
} from '@auth/installation/domain/ports/job-device-lookup.port';
import {
  INSTALLATION_FLEET,
  type InstallationFleet,
} from '@auth/installation/domain/ports/installation-fleet.port';
import {
  INSTALLATION_COMPLETION,
  type InstallationCompletion,
} from '@auth/installation/domain/ports/installation-completion.port';
import { installerJob } from './support/current-installer';
import { JOB_CHANGED_MESSAGE, moveJob } from './support/job-transition';
import { assertGateOpen } from './support/checklist-gates';

function boundDeviceIds(units: StoredDeviceAssignment[]): string[] {
  return units.flatMap((unit) => (unit.fleetDeviceId ? [unit.fleetDeviceId] : []));
}

@Injectable()
export class InstallerJobActionsUseCases {
  private readonly logger = new Logger(InstallerJobActionsUseCases.name);

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(INSTALLATION_ORDER_REPOSITORY) private readonly orders: InstallationOrderRepository,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY) private readonly applications: OnboardingApplicationRepository,
    @Inject(JOB_DEVICE_LOOKUP) private readonly devices: JobDeviceLookup,
    @Inject(INSTALLATION_FLEET) private readonly fleet: InstallationFleet,
    @Inject(INSTALLATION_COMPLETION) private readonly completion: InstallationCompletion,
  ) {}

  async accept(accessToken: string, jobId: string, now: Date = new Date()): Promise<void> {
    const { order } = await this.job(accessToken, jobId);
    if (order.status !== 'assigned') {
      throw new InstallationJobConflictError(`A job that is ${order.status} cannot be accepted`);
    }
    await moveJob(this.orders, order, 'accepted', now);
  }

  async start(accessToken: string, jobId: string, now: Date = new Date()): Promise<void> {
    const { order } = await this.job(accessToken, jobId);
    if (!START_SOURCE_STATUSES.includes(order.status)) {
      throw new InstallationJobConflictError(`A job that is ${order.status} cannot be started`);
    }
    const units = await this.orders.findAssignments(order.id);
    const deviceIds = boundDeviceIds(units);
    if (units.length === 0 || deviceIds.length < units.length) {
      throw new InstallationJobConflictError('Every unit needs its device bound before the installation can start');
    }
    await moveJob(this.orders, order, 'in_progress', now);
    await this.beginVerification(order, deviceIds);
  }

  /** Fleet inside the hold, so a fleet refusal leaves the job in progress to retry. */
  async complete(accessToken: string, jobId: string, now: Date = new Date()): Promise<void> {
    const { order } = await this.job(accessToken, jobId);
    if (order.status !== 'in_progress') {
      throw new InstallationJobConflictError('Only an installation in progress can be completed');
    }
    await this.assertChecklistDone(order);
    await this.assertAtInstallation(order);
    const completed = transitionOrder(order, 'completed', now);
    if (!(await this.completion.complete(completed, order.status, () => this.handOver(order)))) {
      throw new InstallationJobConflictError(JOB_CHANGED_MESSAGE);
    }
  }

  private job(accessToken: string, jobId: string) {
    return installerJob({ tokens: this.tokens, installers: this.installers, orders: this.orders }, accessToken, jobId);
  }

  private async beginVerification(order: StoredInstallationOrder, deviceIds: string[]): Promise<void> {
    const started = await this.fleet.beginVerification(order.tenantId, deviceIds).catch(() => null);
    if (!started) {
      this.logger.warn(`installation_verification_not_started:${order.orderNumber}:fleet_unavailable`);
      return;
    }
    for (const item of started.filter((entry) => entry.outcome === 'refused' || entry.outcome === 'missing')) {
      this.logger.warn(`installation_verification_not_started:${order.orderNumber}:${item.deviceId}:${item.outcome}:${item.reason ?? ''}`);
    }
  }

  private async assertChecklistDone(order: StoredInstallationOrder): Promise<void> {
    const ticks = await this.orders.findTicks(order.id);
    if (!isChecklistComplete(ticks.map((tick) => tick.itemKey))) {
      const done = ticks.filter((tick) => CHECKLIST_ITEMS.some((item) => item.key === tick.itemKey)).length;
      throw new InstallationJobConflictError(`${done}/${CHECKLIST_ITEMS.length} checklist items are complete`);
    }
    for (const gate of CHECKLIST_GATES) {
      await assertGateOpen({ orders: this.orders, devices: this.devices }, order, gate);
    }
  }

  private async assertAtInstallation(order: StoredInstallationOrder): Promise<void> {
    const application = await this.applications.findById(order.applicationId);
    if (!application) throw new InstallationJobNotFoundError('The onboarding for this job no longer exists');
    assertStageAdvance(application.stage, 'connectivity_verification');
  }

  private async handOver(order: StoredInstallationOrder): Promise<void> {
    const [units, vehicles] = await Promise.all([
      this.orders.findAssignments(order.id),
      this.applications.findVehiclesByApplicationId(order.applicationId),
    ]);
    for (const unit of units) {
      const vehicle = vehicles.find((candidate) => candidate.id === unit.vehicleId);
      if (!vehicle || !unit.fleetDeviceId) {
        throw new InstallationJobConflictError(`Unit ${unit.deviceIndex} has no vehicle or device to hand over`);
      }
      await this.fleet.handOver(order.tenantId, { deviceId: unit.fleetDeviceId, vehicle });
    }
  }
}
