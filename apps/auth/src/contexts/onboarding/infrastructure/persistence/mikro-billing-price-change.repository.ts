import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { getAuthOrm } from '@auth/session/infrastructure/persistence/auth-orm';
import type {
  BillingPriceChangeFilter,
  BillingPriceChangeRepository,
} from '@auth/onboarding/domain/billing-price-change.repository';
import { BillingPriceChangeRecord } from './onboarding-orm';
import { toPriceChange } from './mikro-billing-mappers';

@Injectable()
export class MikroBillingPriceChangeRepository
  implements BillingPriceChangeRepository
{
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async list(filter: BillingPriceChangeFilter) {
    const orm = await getAuthOrm(this.config.db);
    const where = {
      ...(filter.itemType && { itemType: filter.itemType }),
      ...(filter.itemRef && { itemRef: filter.itemRef }),
    };
    const [records, total] = await orm.em
      .fork()
      .findAndCount(BillingPriceChangeRecord, where, {
        orderBy: { createdAt: 'desc', id: 'asc' },
        limit: filter.limit,
        offset: (filter.page - 1) * filter.limit,
      });
    return { items: records.map(toPriceChange), total };
  }
}
