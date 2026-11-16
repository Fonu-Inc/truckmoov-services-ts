import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { RecordDeviceTelemetryUseCase } from "./contexts/fleet/devices/application/use-cases/record-device-telemetry.use-case";
import { busVerifier } from "./verified-bus-handler";

/**
 * Closes a verification window when the device finally speaks.
 *
 * Subscribed separately from the vehicle location listener because the two want
 * different things from the same event. That one needs a vehicle; a device
 * being installed has none yet, which is exactly the case this must catch.
 *
 * The device id is used first and the IMEI second: tracking resolves the id
 * from the IMEI, and on a cold cache it forwards the IMEI as the id.
 */
@Injectable()
export class DeviceTelemetryListener implements OnApplicationBootstrap {
  private readonly logger = new Logger(DeviceTelemetryListener.name);

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(RecordDeviceTelemetryUseCase)
    private readonly recordTelemetry: RecordDeviceTelemetryUseCase,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.bus.subscribe(
      "tm.*.vehicle.location.updated",
      busVerifier(this.config, this.logger)(async (envelope) => {
        const deviceId = (envelope.data["device_id"] as string) || null;
        const imei = (envelope.data["imei"] as string) || null;
        if (!deviceId && !imei) return;

        const reportedProtocol = (envelope.data["protocol"] as string) || undefined;

        try {
          await this.recordTelemetry.execute({
            tenantId: envelope.tenant_id,
            deviceId,
            imei,
            reportedAt: envelope.occurred_at,
            reportedProtocol,
          });
        } catch (error) {
          this.logger.warn(
            `device_telemetry_record_failed:${deviceId ?? imei}:${
              error instanceof Error ? error.message : "unknown"
            }`,
          );
        }
      }),
      "device-verification",
    );
  }
}
