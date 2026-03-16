import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { DRIVER_REPOSITORY, type DriverRepository } from "./contexts/fleet/drivers/domain/repositories/driver.repository";

const jobMenu = (jobId: string) =>
  `*TruckMoov* — New Job Assigned 🚚\n\nJob: *${jobId}*\n\nReply with:\n*ACCEPT* — Accept this job\n*REJECT* — Decline this job\n*STATUS* — Confirm your location is active`;

@Injectable()
export class JobAssignmentNotifier implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobAssignmentNotifier.name);
  private unsub?: () => Promise<void>;

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(DRIVER_REPOSITORY) private readonly driverRepo: DriverRepository,
  ) {}

  async onApplicationBootstrap() {
    this.unsub = await this.bus.subscribe("tm.*.job.status.changed", async (event) => {
      const d = event.data as Record<string, unknown>;
      if (d["new_status"] !== "assigned") return;

      const driverId = d["driver_id"] as string | undefined;
      const jobId = d["job_id"] as string | undefined;
      if (!driverId || !jobId) return;

      const driver = await this.driverRepo.findById(driverId);
      const phone = driver?.contactChannels.whatsappNumber;
      if (!phone) return;

      await this.bus.publish(`tm.${event.tenant_id}.notification.send`, {
        id: crypto.randomUUID(),
        type: "notification.send",
        version: 1,
        occurred_at: new Date().toISOString(),
        tenant_id: event.tenant_id,
        data: { channel: "whatsapp", recipient: phone, content: jobMenu(jobId) },
      });

      this.logger.log(`Job assignment notification queued for driver ${driverId}`);
    });
  }

  async onApplicationShutdown() {
    await this.unsub?.();
  }
}
