import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { runIfLockFree } from '@shared/db';
import { sweepSafely } from '@shared/observability';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { ApplicationDeviceAllocationLedger } from '@auth/onboarding/application/services/application-device-allocation.ledger';
import { selectOwedWithStock } from '@auth/onboarding/application/services/application-device-allocation.logic';
import { ApplicationDeviceAllocationService } from '@auth/onboarding/application/services/application-device-allocation.service';
import { OnboardingDeviceInventoryService } from '@auth/onboarding/application/services/onboarding-device-inventory.service';
import { OnboardingProvisioningService } from '@auth/onboarding/application/services/onboarding-provisioning.service';

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const FIRST_SWEEP_DELAY_MS = 2 * 60 * 1000;
const BATCH_SIZE = 50;
export const DEVICE_ALLOCATION_SWEEP_LOCK_ID = 8_246_113_070_024;

type SweepSummary = { attempted: number; allocated: number; completed: number; advanced: number };
const EMPTY_SWEEP: SweepSummary = { attempted: 0, allocated: 0, completed: 0, advanced: 0 };

/**
 * Supplies approved applications that are still owed devices once platform
 * stock allows, oldest first, and releases any that were held at provisioning
 * for want of that stock.
 */
@Injectable()
export class DeviceAllocationSweepService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DeviceAllocationSweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(ApplicationDeviceAllocationLedger)
    private readonly ledger: ApplicationDeviceAllocationLedger,
    @Inject(ApplicationDeviceAllocationService)
    private readonly allocation: ApplicationDeviceAllocationService,
    @Inject(OnboardingDeviceInventoryService)
    private readonly inventory: OnboardingDeviceInventoryService,
    @Inject(OnboardingProvisioningService)
    private readonly provisioning: OnboardingProvisioningService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.persistence.backend !== 'mikro-orm') return;
    const run = () => sweepSafely(this.logger, 'device_allocation', () => this.run());
    this.firstRun = setTimeout(run, FIRST_SWEEP_DELAY_MS);
    this.timer = setInterval(run, SWEEP_INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.firstRun) clearTimeout(this.firstRun);
  }

  async run(): Promise<SweepSummary> {
    if (this.running) return EMPTY_SWEEP;
    this.running = true;

    try {
      return await this.exclusively(() => this.sweep());
    } finally {
      this.running = false;
    }
  }

  private async exclusively(task: () => Promise<SweepSummary>): Promise<SweepSummary> {
    if (this.config.persistence.backend !== 'mikro-orm') return task();

    const orm = await getAuthOrm(this.config.db);
    const result = await runIfLockFree(orm, DEVICE_ALLOCATION_SWEEP_LOCK_ID, task);
    return result.acquired ? result.value : EMPTY_SWEEP;
  }

  private async sweep(): Promise<SweepSummary> {
    const summary = { ...EMPTY_SWEEP };
    for (const applicationId of await this.ledger.listSuppliedAtProvisioning(BATCH_SIZE)) {
      if (await this.release(applicationId)) summary.advanced += 1;
    }

    const stock = await this.inventory.availability();
    const owing =
      stock.tracked && stock.availableQuantity > 0
        ? selectOwedWithStock(await this.ledger.listOwed(BATCH_SIZE), stock.availableQuantity)
        : [];
    for (const row of owing) {
      const application = await this.applications.findById(row.applicationId);
      if (!application || application.status !== 'approved' || application.tenantId !== row.tenantId) {
        await this.ledger.record(row.applicationId, row.tenantId, 0, 0).catch(() => undefined);
        continue;
      }

      summary.attempted += 1;
      const owed = await this.allocation.allocate(application);
      if (owed === null) continue;
      summary.allocated += Math.max(0, row.owed - owed);
      if (owed > 0) continue;

      summary.completed += 1;
      if (await this.release(row.applicationId)) summary.advanced += 1;
    }

    if (summary.attempted > 0 || summary.advanced > 0) {
      this.logger.log(
        `device_allocation_sweep:attempted=${summary.attempted}:allocated=${summary.allocated}:completed=${summary.completed}:advanced=${summary.advanced}`,
      );
    }
    return summary;
  }

  private async release(applicationId: string): Promise<boolean> {
    try {
      const fresh = await this.applications.findById(applicationId);
      if (!fresh) return false;
      return (await this.provisioning.openPayment(fresh)) !== null;
    } catch (error) {
      this.logger.warn(
        `device_allocation_release_failed:${applicationId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return false;
    }
  }
}
