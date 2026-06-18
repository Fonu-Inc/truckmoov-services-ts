import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  TenantWalletRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { StoredTenantWallet, TenantWalletRepository } from './tenant-wallet.repository';

function toStored(r: TenantWalletRecord): StoredTenantWallet {
  return {
    tenantId: r.tenantId,
    balanceKobo: r.balanceKobo,
    currency: r.currency,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class MikroTenantWalletRepository implements TenantWalletRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findByTenantId(tenantId: string): Promise<StoredTenantWallet | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(TenantWalletRecord, { tenantId });
    return record ? toStored(record) : null;
  }

  async save(wallet: StoredTenantWallet): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(TenantWalletRecord, wallet as unknown as TenantWalletRecord);
  }
}
