import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import type {
  DeviceVerificationFailure,
  DeviceVerificationFailureRepository,
} from "../../domain/repositories/device-verification-failure.repository";
import {
  DeviceVerificationFailureRecord,
  getFleetOrm,
} from "../../../shared/infrastructure/persistence/fleet-orm";

@Injectable()
export class MikroDeviceVerificationFailureRepository
  implements DeviceVerificationFailureRepository
{
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async append(failure: DeviceVerificationFailure): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(DeviceVerificationFailureRecord, {
      id: failure.id,
      tenantId: failure.tenantId,
      deviceId: failure.deviceId,
      imei: failure.imei,
      reason: failure.reason,
      detail: failure.detail,
      rawPayload: failure.rawPayload,
      sourceAddress: failure.sourceAddress,
      createdAt: new Date(failure.createdAt),
    });
  }

  async findByDevice(
    deviceId: string,
    tenantId: string,
    limit: number,
  ): Promise<DeviceVerificationFailure[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      DeviceVerificationFailureRecord,
      { deviceId, tenantId },
      { orderBy: { createdAt: "desc" }, limit },
    );
    return records.map((record) => ({
      id: record.id,
      tenantId: record.tenantId,
      deviceId: record.deviceId,
      imei: record.imei,
      reason: record.reason,
      detail: record.detail ?? null,
      rawPayload: record.rawPayload ?? null,
      sourceAddress: record.sourceAddress ?? null,
      createdAt: record.createdAt.toISOString(),
    }));
  }
}
