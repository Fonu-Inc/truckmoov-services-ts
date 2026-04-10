import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  SystemDeviceModelRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import {
  type DeviceModelCatalogRepository,
  type StoredSystemDeviceModel,
} from './device-model-catalog.repository';

function toStored(record: SystemDeviceModelRecord): StoredSystemDeviceModel {
  return {
    id: record.id,
    manufacturer: record.manufacturer,
    model: record.model,
    protocolType:
      record.protocolType as StoredSystemDeviceModel['protocolType'],
    defaultPort: record.defaultPort,
    supportedFeatures:
      (record.supportedFeatures as StoredSystemDeviceModel['supportedFeatures']) ??
      [],
    status: record.status as StoredSystemDeviceModel['status'],
    configurationInstructions: record.configurationInstructions ?? null,
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

@Injectable()
export class MikroDeviceModelCatalogRepository implements DeviceModelCatalogRepository {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async save(model: StoredSystemDeviceModel): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(SystemDeviceModelRecord, {
      id: model.id,
      manufacturer: model.manufacturer,
      model: model.model,
      protocolType: model.protocolType,
      defaultPort: model.defaultPort,
      supportedFeatures: model.supportedFeatures,
      status: model.status,
      configurationInstructions: model.configurationInstructions,
      createdByUserId: model.createdByUserId,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    });
  }

  async findById(id: string): Promise<StoredSystemDeviceModel | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(SystemDeviceModelRecord, { id });
    return record ? toStored(record) : null;
  }

  async findByManufacturerAndModel(
    manufacturer: string,
    model: string,
  ): Promise<StoredSystemDeviceModel | null> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ id: string }>>(
      `select id
       from system_device_models
       where lower(manufacturer) = lower(?) and lower(model) = lower(?)
       limit 1`,
      [manufacturer.trim(), model.trim()],
    );
    const id = rows[0]?.id;
    return id ? this.findById(id) : null;
  }

  async findAll(): Promise<StoredSystemDeviceModel[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      SystemDeviceModelRecord,
      {},
      { orderBy: { manufacturer: 'asc', model: 'asc' } },
    );
    return records.map((record) => toStored(record));
  }

  async deleteById(id: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(SystemDeviceModelRecord, { id });
  }
}
