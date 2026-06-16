import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  DeviceSetupRequestRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  DeviceSetupRequestFilters,
  DeviceSetupRequestRepository,
  DeviceSetupRequestStatus,
  StoredDeviceSetupRequest,
} from './device-setup-request.repository';

function toStored(record: DeviceSetupRequestRecord): StoredDeviceSetupRequest {
  return {
    id: record.id,
    imei: record.imei,
    manufacturer: record.manufacturer,
    model: record.model,
    connectionType: record.connectionType,
    requesterName: record.requesterName,
    needsSim: record.needsSim,
    vehiclePlate: record.vehiclePlate,
    location: record.location,
    tenantId: record.tenantId,
    status: record.status as DeviceSetupRequestStatus,
    assignedTo: record.assignedTo,
    notes: record.notes,
    preferredInstallDate: record.preferredInstallDate,
    rejectedReason: record.rejectedReason,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

@Injectable()
export class MikroDeviceSetupRequestRepository
  implements DeviceSetupRequestRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async findAll(
    filters?: DeviceSetupRequestFilters,
  ): Promise<StoredDeviceSetupRequest[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.tenantId) where.tenantId = filters.tenantId;
    if (filters?.manufacturer) where.manufacturer = filters.manufacturer;
    const createdAt: Record<string, Date> = {};
    if (filters?.dateFrom) createdAt.$gte = new Date(filters.dateFrom);
    if (filters?.dateTo) createdAt.$lte = new Date(filters.dateTo);
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
    if (filters?.search) {
      const q = `%${filters.search}%`;
      where.$or = [
        { imei: { $ilike: q } },
        { manufacturer: { $ilike: q } },
        { model: { $ilike: q } },
        { requesterName: { $ilike: q } },
      ];
    }
    const records = await em.find(DeviceSetupRequestRecord, where, {
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toStored);
  }

  async findById(id: string): Promise<StoredDeviceSetupRequest | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(DeviceSetupRequestRecord, { id });
    return record ? toStored(record) : null;
  }

  async save(request: StoredDeviceSetupRequest): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(DeviceSetupRequestRecord, { ...request });
  }
}
