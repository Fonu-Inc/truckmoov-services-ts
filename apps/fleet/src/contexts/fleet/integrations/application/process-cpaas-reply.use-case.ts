import { Inject, Injectable, Logger } from "@nestjs/common";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { DRIVER_REPOSITORY, type DriverRepository } from "../../drivers/domain/repositories/driver.repository";
import { JOB_REPOSITORY, type JobRepository } from "../../jobs/domain/repositories/job.repository";

const REPLY_TO_STATUS: Record<string, string> = {
  ACCEPT: "assigned",
  ACCEPTED: "assigned",
  REJECT: "pending",
  REJECTED: "pending",
  PICKUP: "en_route",
  ARRIVED: "arrived",
  DELIVERED: "delivered",
  DONE: "delivered",
  CANCEL: "cancelled",
  CANCELLED: "cancelled",
};

const STATUS_ACK = "📍 *TruckMoov*: Your location is being tracked. No action needed.";

@Injectable()
export class ProcessCpaasReplyUseCase {
  private readonly logger = new Logger(ProcessCpaasReplyUseCase.name);

  constructor(
    @Inject(DRIVER_REPOSITORY) private readonly driverRepo: DriverRepository,
    @Inject(JOB_REPOSITORY) private readonly jobRepo: JobRepository,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
  ) {}

  async execute(tenantId: string, from: string, body: string): Promise<void> {
    const keyword = body.trim().toUpperCase().split(/\s+/)[0];

    if (keyword === "STATUS") {
      await this.sendAck(tenantId, from, STATUS_ACK);
      return;
    }

    const newStatus = REPLY_TO_STATUS[keyword];
    if (!newStatus) {
      this.logger.debug(`Unrecognised keyword "${keyword}" from ${from}`);
      return;
    }

    const driver = await this.driverRepo.findByWhatsappNumber(from, tenantId);
    if (!driver) {
      this.logger.warn(`No driver with whatsapp ${from} in tenant ${tenantId}`);
      return;
    }

    if (!driver.assignedVehicleId) {
      this.logger.warn(`Driver ${driver.id} has no assigned vehicle`);
      return;
    }

    const jobs = await this.jobRepo.findAll({ tenantId });
    const activeJob = jobs.find(
      (j) => j.assignedVehicleId === driver.assignedVehicleId && !["delivered", "cancelled"].includes(j.status),
    );

    if (!activeJob) {
      this.logger.warn(`No active job for driver ${driver.id}`);
      return;
    }

    await this.bus.publish(`tm.${tenantId}.job.status.changed`, {
      id: crypto.randomUUID(),
      type: "job.status.changed",
      version: 1,
      occurred_at: new Date().toISOString(),
      tenant_id: tenantId,
      data: {
        job_id: activeJob.jobId,
        previous_status: activeJob.status,
        new_status: newStatus,
        driver_id: driver.id,
        vehicle_id: driver.assignedVehicleId,
        source: "cpaas_reply",
      },
    });

    const ack = newStatus === "pending"
      ? `✖ *TruckMoov*: Job ${activeJob.jobId} declined. A dispatcher will reassign it.`
      : `✔ *TruckMoov*: Status updated to *${newStatus}* for job ${activeJob.jobId}.`;

    await this.sendAck(tenantId, from, ack);
    this.logger.log(`Job ${activeJob.jobId} → ${newStatus} via WhatsApp from driver ${driver.id}`);
  }

  private async sendAck(tenantId: string, to: string, content: string): Promise<void> {
    await this.bus.publish(`tm.${tenantId}.notification.send`, {
      id: crypto.randomUUID(),
      type: "notification.send",
      version: 1,
      occurred_at: new Date().toISOString(),
      tenant_id: tenantId,
      data: { channel: "whatsapp", recipient: to, content },
    });
  }
}
