import { Inject, Injectable, Logger } from '@nestjs/common';
import { ManageInstallationOrdersUseCases } from '@auth/installation';
import { SYSTEM_TENANT_ID } from '@shared/identity';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { requestedDeviceCount } from '@auth/onboarding/domain/onboarding-application.support';
import { ActivityLogService } from '../../../../activity-log.service';
import { FleetFactsService } from '../../../../fleet-facts.service';
import { PlatformAlertPublisher } from '../../../../platform-alert.publisher';
import { OnboardingDeviceInventoryService } from './onboarding-device-inventory.service';
import { ApplicationDeviceAllocationLedger } from './application-device-allocation.ledger';
import { owedDevices, shouldRaiseShortfallAlert } from './application-device-allocation.logic';

const SYSTEM_ACTOR_ID = 'system';

export { owedDevices };

export type DeviceAllocationSummary = { requested: number; allocated: number; owed: number };

/**
 * Gives an approved tenant the devices its application asked for, out of the
 * platform's own stock. Never throws: an approval stands whatever happens here.
 */
@Injectable()
export class ApplicationDeviceAllocationService {
  private readonly logger = new Logger(ApplicationDeviceAllocationService.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
    @Inject(OnboardingDeviceInventoryService)
    private readonly inventory: OnboardingDeviceInventoryService,
    @Inject(ActivityLogService) private readonly activityLog: ActivityLogService,
    @Inject(PlatformAlertPublisher) private readonly alerts: PlatformAlertPublisher,
    @Inject(ManageInstallationOrdersUseCases)
    private readonly installations: ManageInstallationOrdersUseCases,
    @Inject(ApplicationDeviceAllocationLedger)
    private readonly ledger: ApplicationDeviceAllocationLedger,
  ) {}

  async summary(application: StoredOnboardingApplication): Promise<DeviceAllocationSummary> {
    const requests = await this.applications.findDeviceRequestsByApplicationId(application.id);
    const requested = requestedDeviceCount(requests);
    const allocated = application.tenantId ? await this.inventory.heldBy(application.tenantId) : 0;
    return { requested, allocated, owed: owedDevices(requested, allocated) };
  }

  /** Devices still owed afterwards, or null when nothing could be attempted. */
  async allocate(application: StoredOnboardingApplication): Promise<number | null> {
    try {
      return await this.run(application);
    } catch (error) {
      this.logger.warn(
        `device_allocation_failed:${application.id}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  private async run(application: StoredOnboardingApplication): Promise<number | null> {
    const tenantId = application.tenantId;
    if (!tenantId) return null;
    const requests = await this.applications.findDeviceRequestsByApplicationId(application.id);
    const requested = requestedDeviceCount(requests);
    if (requested < 1) return null;

    const result = await this.fleet.allocateDevicesFromStock(
      tenantId,
      requested,
      `Automatic allocation for application ${application.reference}`,
    );

    let deviceIds: string[] = [];
    let shortfall: number;
    if (result.ok) {
      deviceIds = result.deviceIds;
      shortfall = result.shortfall;
    } else {
      this.logger.warn(`device_allocation_refused:${application.id}:${result.status}:${result.message}`);
      // Fleet may have moved devices before failing, so what the tenant holds decides what is owed.
      shortfall = owedDevices(requested, await this.inventory.heldBy(tenantId).catch(() => 0));
    }

    // Sequential: every write takes the same chain advisory lock, so parallel calls only hold extra connections.
    for (const deviceId of deviceIds) {
      await this.attempt(`audit:${deviceId}`, () =>
        this.activityLog.record({
          tenantId: SYSTEM_TENANT_ID,
          actorId: SYSTEM_ACTOR_ID,
          service: 'auth',
          action: 'system.device.assigned',
          entityType: 'device',
          entityId: deviceId,
          summary: 'Device automatically allocated to tenant on application approval',
          metadata: {
            tenantId,
            applicationId: application.id,
            reference: application.reference,
            deviceIds,
            requested,
            shortfall,
            automatic: true,
          },
        }),
      );
    }

    if (deviceIds.length > 0) {
      await this.attempt('auto_bind_units', () => this.installations.autoBindUnits(tenantId, null, deviceIds));
    }

    await this.attempt('ledger', () => this.ledger.record(application.id, tenantId, requested, shortfall));

    if (shortfall > 0) {
      await this.attempt('shortfall_alert', async () => {
        const alerted = await this.ledger.alertedOwed(application.id).catch(() => null);
        if (!shouldRaiseShortfallAlert(alerted, shortfall)) return;
        await this.raiseShortfall(application, requested, shortfall);
        await this.ledger.markAlerted(application.id, shortfall);
      });
    }
    return shortfall;
  }

  private async attempt(step: string, action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.logger.warn(`device_allocation_${step}_failed:${error instanceof Error ? error.message : 'unknown'}`);
    }
  }

  private raiseShortfall(
    application: StoredOnboardingApplication,
    requested: number,
    shortfall: number,
  ): Promise<void> {
    return this.alerts.raise({
      alertType: 'installation_issues',
      severity: 'high',
      subject: `Device stock short for ${application.organizationName}`,
      body: `Application ${application.reference} asked for ${requested} devices and ${shortfall} are still owed after automatic allocation from platform stock. Assign the rest with Record Assignment once stock is available.`,
      context: { applicationId: application.id, reference: application.reference, tenantId: application.tenantId, requested, shortfall },
    });
  }
}
