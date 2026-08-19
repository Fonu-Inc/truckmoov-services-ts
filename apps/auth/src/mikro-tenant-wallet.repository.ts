import { Inject, Injectable } from '@nestjs/common';
import { LockMode } from '@mikro-orm/core';
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

  async debit(tenantId: string, amountKobo: number): Promise<boolean> {
    const orm = await getAuthOrm(this.config.db);
    return orm.em.fork().transactional(async (em) => {
      const record = await em.findOne(
        TenantWalletRecord,
        { tenantId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!record || record.balanceKobo < amountKobo) return false;
      record.balanceKobo -= amountKobo;
      record.updatedAt = new Date();
      await em.flush();
      return true;
    });
  }

  async credit(tenantId: string, amountKobo: number): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.fork().transactional(async (em) => {
      const record = await em.findOne(
        TenantWalletRecord,
        { tenantId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!record) return;
      record.balanceKobo += amountKobo;
      record.updatedAt = new Date();
      await em.flush();
    });
  }
}
