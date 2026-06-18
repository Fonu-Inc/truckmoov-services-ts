import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { EVENT_BUS, type EventBus } from '@shared/eventbus';
import { SIM_REPOSITORY, type SimRepository } from './sim.repository';

@Injectable()
export class SimDeviceInfoListener implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SimDeviceInfoListener.name);
  private unsub?: () => Promise<void>;

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(SIM_REPOSITORY) private readonly simRepo: SimRepository,
  ) {}

  async onApplicationBootstrap() {
    this.unsub = await this.bus.subscribe('tm.*.fleet.device.updated', async (event) => {
      const data = event.data as Record<string, unknown>;
      const simId = typeof data.simId === 'string' ? data.simId : null;
      if (!simId) return;

      const sim = await this.simRepo.findById(simId);
      if (!sim) return;

      await this.simRepo.save({
        ...sim,
        deviceId: typeof data.deviceId === 'string' ? data.deviceId : sim.deviceId,
        deviceName: typeof data.deviceName === 'string' ? data.deviceName : sim.deviceName,
        deviceImei: typeof data.deviceImei === 'string' ? data.deviceImei : sim.deviceImei,
        deviceType: typeof data.deviceType === 'string' ? data.deviceType : sim.deviceType,
        vehicleId: typeof data.vehicleId === 'string' ? data.vehicleId : sim.vehicleId,
        updatedAt: new Date(),
      });
    });
    this.logger.log('SimDeviceInfoListener active');
  }

  async onApplicationShutdown() {
    if (this.unsub) await this.unsub();
  }
}
