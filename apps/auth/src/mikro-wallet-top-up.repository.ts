import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  WalletTopUpRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { StoredWalletTopUp, WalletTopUpRepository } from './wallet-top-up.repository';

function toStored(r: WalletTopUpRecord): StoredWalletTopUp {
  return {
    id: r.id,
    tenantId: r.tenantId,
    amountKobo: r.amountKobo,
    provider: r.provider,
    mobileNumber: r.mobileNumber,
    status: r.status,
    reference: r.reference,
    createdAt: r.createdAt,
  };
}

@Injectable()
export class MikroWalletTopUpRepository implements WalletTopUpRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findAllByTenantId(tenantId: string): Promise<StoredWalletTopUp[]> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<WalletTopUpRecord[]>(
      'select * from wallet_top_ups where tenant_id = ? order by created_at desc',
      [tenantId],
    );
    return rows.map((r) => toStored(r as unknown as WalletTopUpRecord));
  }

  async sumSuccessfulByTenantId(tenantId: string): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ total: string }>>(
      `select coalesce(sum(amount_kobo), 0)::bigint as total from wallet_top_ups where tenant_id = ? and status = 'success'`,
      [tenantId],
    );
    return Number(rows[0]?.total ?? 0);
  }

  async countSuccessfulByTenantId(tenantId: string): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<Array<{ count: string }>>(
      `select count(*)::int as count from wallet_top_ups where tenant_id = ? and status = 'success'`,
      [tenantId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async save(topUp: StoredWalletTopUp): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(WalletTopUpRecord, topUp as unknown as WalletTopUpRecord);
  }
}
