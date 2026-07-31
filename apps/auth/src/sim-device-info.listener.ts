import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';
import {
  SIM_CHANGED_EVENT_PUBLISHER,
  type SimChangedEventPublisher,
  emitSimChanged,
} from './sim-changed-event.publisher';

@Injectable()
export class SimDeviceInfoListener implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SimDeviceInfoListener.name);
  private unsub?: () => Promise<void>;

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(SIM_REPOSITORY) private readonly simRepo: SimRepository,
    @Inject(SIM_CHANGED_EVENT_PUBLISHER) private readonly simEvents: SimChangedEventPublisher,
  ) {}

  async onApplicationBootstrap() {
    this.unsub = await this.bus.subscribe('tm.*.fleet.device.updated', async (event) => {
      const data = event.data as Record<string, unknown>;
      const simId = typeof data.simId === 'string' ? data.simId : null;
      if (!simId) return;

      const sim = await this.simRepo.findById(simId);
      if (!sim) return;

      // The envelope's tenant_id comes from the publishing service's own
      // authenticated context, not from this payload's fields — reject a
      // mismatch rather than let a cross-tenant simId update this SIM.
      if (sim.tenantId !== null && sim.tenantId !== event.tenant_id) {
        this.logger.warn(
          `sim_device_info_tenant_mismatch simId=${simId} simTenant=${sim.tenantId} eventTenant=${event.tenant_id}`,
        );
        return;
      }

      const updated = {
        ...sim,
        deviceId: typeof data.deviceId === 'string' ? data.deviceId : sim.deviceId,
        deviceName: typeof data.deviceName === 'string' ? data.deviceName : sim.deviceName,
        deviceImei: typeof data.deviceImei === 'string' ? data.deviceImei : sim.deviceImei,
        deviceType: typeof data.deviceType === 'string' ? data.deviceType : sim.deviceType,
        vehicleId: typeof data.vehicleId === 'string' ? data.vehicleId : sim.vehicleId,
        updatedAt: new Date(),
      };
      await this.simRepo.save(updated);
      await emitSimChanged(this.simEvents, updated, 'updated');
    });
    this.logger.log('SimDeviceInfoListener active');
  }

  async onApplicationShutdown() {
    if (this.unsub) await this.unsub();
  }
}
