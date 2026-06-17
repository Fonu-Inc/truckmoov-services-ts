import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  TenantBusinessInfoRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  StoredTenantBusinessInfo,
  TenantBusinessInfoRepository,
} from './tenant-business-info.repository';

function toStored(r: TenantBusinessInfoRecord): StoredTenantBusinessInfo {
  return {
    tenantId: r.tenantId,
    companyName: r.companyName,
    registrationNumber: r.registrationNumber,
    taxId: r.taxId,
    businessType: r.businessType,
    industry: r.industry,
    addressLine1: r.addressLine1,
    addressLine2: r.addressLine2,
    city: r.city,
    state: r.state,
    postalCode: r.postalCode,
    country: r.country,
    phone: r.phone,
    email: r.email,
    billingEmail: r.billingEmail,
    website: r.website,
    yearEstablished: r.yearEstablished,
    numberOfEmployees: r.numberOfEmployees,
    verificationStatus: r.verificationStatus as StoredTenantBusinessInfo['verificationStatus'],
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MikroTenantBusinessInfoRepository
  implements TenantBusinessInfoRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async findByTenantId(tenantId: string): Promise<StoredTenantBusinessInfo | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(TenantBusinessInfoRecord, { tenantId });
    return record ? toStored(record) : null;
  }

  async save(info: StoredTenantBusinessInfo): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(TenantBusinessInfoRecord, { ...info });
  }
}
