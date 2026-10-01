import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  WalletTopUpRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type { StoredWalletTopUp, WalletTopUpRepository } from './wallet-top-up.repository';

export interface WalletTopUpRow {
  id: string;
  tenant_id: string;
  amount_kobo: string | number;
  provider: string;
  mobile_number: string;
  status: string;
  reference: string | null;
  settled_at: Date | string | null;
  created_at: Date | string;
}

const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value));

export function toStored(r: WalletTopUpRow): StoredWalletTopUp {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    amountKobo: Number(r.amount_kobo),
    provider: r.provider,
    mobileNumber: r.mobile_number,
    status: r.status,
    reference: r.reference,
    settledAt: r.settled_at ? toDate(r.settled_at) : null,
    createdAt: toDate(r.created_at),
  };
}

@Injectable()
export class MikroWalletTopUpRepository implements WalletTopUpRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async findAllByTenantId(tenantId: string): Promise<StoredWalletTopUp[]> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<WalletTopUpRow[]>(
      'select * from wallet_top_ups where tenant_id = ? order by created_at desc',
      [tenantId],
    );
    return rows.map((r) => toStored(r));
  }

  async findByReference(reference: string): Promise<StoredWalletTopUp | null> {
    const orm = await getAuthOrm(this.config.db);
    const rows = await orm.em.getConnection().execute<WalletTopUpRow[]>(
      'select * from wallet_top_ups where reference = ? limit 1',
      [reference],
    );
    const row = rows[0];
    return row ? toStored(row) : null;
  }

  async markSettled(id: string, settledAt: Date): Promise<boolean> {
    const orm = await getAuthOrm(this.config.db);
    const result = await orm.em.getConnection().execute<Array<{ id: string }>>(
      `update wallet_top_ups
         set status = 'success', settled_at = ?
       where id = ? and status = 'pending'
       returning id`,
      [settledAt, id],
    );
    return result.length === 1;
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
