import { Inject, Injectable } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import { readSetupRequestCharges } from "@shared/devices";
import {
  DeviceSetupRequest,
  setupRequestSearchFields,
  type DeviceSetupRequestStatus,
  type TrackerType,
} from "../../domain/entities/device-setup-request.entity";
import type {
  DeviceSetupRequestFilters,
  DeviceSetupRequestRepository,
} from "../../domain/repositories/device-setup-request.repository";
import {
  DeviceSetupRequestRecord,
  getFleetOrm,
} from "../../../shared/infrastructure/persistence/fleet-orm";

@Injectable()
export class MikroDeviceSetupRequestRepository implements DeviceSetupRequestRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async save(request: DeviceSetupRequest): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const p = request.toPrimitives();
    await em.upsert(DeviceSetupRequestRecord, {
      id: p.id,
      tenantId: p.tenantId,
      requestedByUserId: p.requestedByUserId ?? null,
      organisationName: p.organisationName ?? null,
      requestingEmail: p.requestingEmail ?? null,
      referenceNumber: p.referenceNumber,
      manufacturer: p.manufacturer ?? null,
      model: p.model ?? null,
      trackerType: p.trackerType ?? null,
      quantity: p.quantity,
      simRequired: p.simRequired,
      carrierId: p.carrierId ?? null,
      planType: p.planType ?? null,
      bundleId: p.bundleId ?? null,
      vehicleId: p.vehicleId ?? null,
      state: p.state ?? null,
      city: p.city ?? null,
      preferredDate: p.preferredDate ?? null,
      preferredTime: p.preferredTime ?? null,
      useCase: p.useCase,
      notes: p.notes ?? null,
      status: p.status,
      timeline: p.timeline,
      assignedTo: p.assignedTo ?? null,
      charges: p.charges ?? null,
      decidedBy: p.decidedBy ?? null,
      decidedAt: p.decidedAt ? new Date(p.decidedAt) : null,
      decisionReason: p.decisionReason ?? null,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
    });
  }

  async findAll(filters: DeviceSetupRequestFilters): Promise<DeviceSetupRequest[]> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      DeviceSetupRequestRecord,
      {
        tenantId: filters.tenantId,
        ...(filters?.status ? { status: filters.status } : {}),
      },
      { orderBy: { createdAt: "desc" } },
    );

    const requests = records.map((record) => this.toDomain(record));
    const query = filters?.query?.trim().toLowerCase();
    if (!query) return requests;
    return requests.filter((request) =>
      setupRequestSearchFields(request.toPrimitives()).some((value) => value.toLowerCase().includes(query)),
    );
  }

  async findById(id: string, tenantId: string): Promise<DeviceSetupRequest | null> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(DeviceSetupRequestRecord, { id, tenantId });
    return record ? this.toDomain(record) : null;
  }

  async referenceExists(referenceNumber: string): Promise<boolean> {
    const orm = await getFleetOrm(this.config.db);
    return (await orm.em.fork().count(DeviceSetupRequestRecord, { referenceNumber })) > 0;
  }

  async deleteById(id: string, tenantId: string): Promise<void> {
    const orm = await getFleetOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(DeviceSetupRequestRecord, { id, tenantId });
  }

  private toDomain(record: DeviceSetupRequestRecord): DeviceSetupRequest {
    return DeviceSetupRequest.fromPrimitives({
      id: record.id,
      tenantId: record.tenantId,
      requestedByUserId: record.requestedByUserId ?? null,
      organisationName: record.organisationName ?? null,
      requestingEmail: record.requestingEmail ?? null,
      referenceNumber: record.referenceNumber,
      manufacturer: record.manufacturer ?? null,
      model: record.model ?? null,
      trackerType: (record.trackerType as TrackerType | null) ?? null,
      quantity: record.quantity,
      simRequired: record.simRequired,
      carrierId: record.carrierId ?? null,
      planType: record.planType ?? null,
      bundleId: record.bundleId ?? null,
      vehicleId: record.vehicleId ?? null,
      state: record.state ?? null,
      city: record.city ?? null,
      preferredDate: record.preferredDate ?? null,
      preferredTime: record.preferredTime ?? null,
      useCase: record.useCase,
      notes: record.notes ?? null,
      status: record.status as DeviceSetupRequestStatus,
      assignedTo: record.assignedTo ?? null,
      charges: readSetupRequestCharges(record.charges),
      decidedBy: record.decidedBy ?? null,
      decidedAt: record.decidedAt?.toISOString() ?? null,
      decisionReason: record.decisionReason ?? null,
      timeline: (record.timeline ?? []).map((t) => ({
        status: t.status as DeviceSetupRequestStatus,
        at: t.at,
        note: t.note ?? null,
      })),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }
}
