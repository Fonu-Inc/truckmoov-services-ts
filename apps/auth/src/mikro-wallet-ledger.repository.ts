import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  WalletLedgerEntryRecord,
  getAuthOrm,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import type {
  StoredWalletLedgerEntry,
  WalletLedgerCategory,
  WalletLedgerDirection,
  WalletLedgerFilters,
  WalletLedgerRepository,
} from './wallet-ledger.repository';

function toStored(record: WalletLedgerEntryRecord): StoredWalletLedgerEntry {
  return {
    id: record.id,
    seq: Number(record.seq),
    tenantId: record.tenantId,
    direction: record.direction as WalletLedgerDirection,
    category: record.category as WalletLedgerCategory,
    amountKobo: Number(record.amountKobo),
    balanceAfterKobo: Number(record.balanceAfterKobo),
    unitRateKobo: Number(record.unitRateKobo),
    quantity: record.quantity,
    reason: record.reason,
    reference: record.reference,
    createdAt: record.createdAt,
  };
}

function whereFrom(tenantId: string, filters?: WalletLedgerFilters): Record<string, unknown> {
  const where: Record<string, unknown> = { tenantId };
  if (filters?.category) where.category = filters.category;
  if (filters?.direction) where.direction = filters.direction;
  if (filters?.from || filters?.to) {
    where.createdAt = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }
  return where;
}

@Injectable()
export class MikroWalletLedgerRepository implements WalletLedgerRepository {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async list(
    tenantId: string,
    filters?: WalletLedgerFilters,
  ): Promise<{ items: StoredWalletLedgerEntry[]; total: number }> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;

    const [records, total] = await em.findAndCount(
      WalletLedgerEntryRecord,
      whereFrom(tenantId, filters) as never,
      { orderBy: { seq: 'desc' }, limit, offset: (page - 1) * limit },
    );
    return { items: records.map(toStored), total };
  }

  async sum(tenantId: string, filters?: WalletLedgerFilters): Promise<number> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      WalletLedgerEntryRecord,
      whereFrom(tenantId, filters) as never,
      { fields: ['amountKobo'] },
    );
    return records.reduce((total, record) => total + Number(record.amountKobo), 0);
  }
}
