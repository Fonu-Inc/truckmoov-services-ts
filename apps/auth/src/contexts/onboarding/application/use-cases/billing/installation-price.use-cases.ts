import { Inject, Injectable } from '@nestjs/common';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  realChanges,
  requirePositiveInt,
  requireReason,
  resolveEffectiveDate,
  toPriceChanges,
  type PriceDelta,
} from '@auth/onboarding/domain/billing-pricing';
import {
  BILLING_PRICE_CHANGE_REPOSITORY,
  type BillingPriceChangeRepository,
} from '@auth/onboarding/domain/billing-price-change.repository';
import {
  BILLING_SETTING_KEYS,
  BILLING_SETTINGS_REPOSITORY,
  type BillingSettingsRepository,
  type PricedSettingsEdit,
} from '@auth/onboarding/domain/billing-settings.repository';
import type { InstallationFees } from '@auth/onboarding/domain/onboarding-order';
import {
  BILLING_AUDIT,
  type BillingActor,
  type BillingAudit,
} from '@auth/onboarding/domain/ports/billing-audit.port';
import { success, toPriceChangeView } from './billing-views';
import { installationFeesFrom, loadInstallationFees } from '../support/installation-fees';

const ITEM_REF = 'installation_fee';
const RECENT_HISTORY_LIMIT = 10;

export type UpdateInstallationPriceInput = {
  enterpriseNgn: unknown;
  ownerOperatorNgn: unknown;
  reason?: unknown;
  effectiveDate?: string;
};

async function view(
  settings: BillingSettingsRepository,
  history: BillingPriceChangeRepository,
) {
  const [fees, stored, recent] = await Promise.all([
    loadInstallationFees(settings),
    settings.getAll(),
    history.list({
      itemType: 'installation_fee',
      itemRef: ITEM_REF,
      page: 1,
      limit: RECENT_HISTORY_LIMIT,
    }),
  ]);
  const touched = [
    stored[BILLING_SETTING_KEYS.installationFeeEnterprise],
    stored[BILLING_SETTING_KEYS.installationFeeOwnerOperator],
  ].filter((setting) => setting !== undefined);
  const lastChangedAt = touched.reduce<Date | null>(
    (latest, setting) =>
      latest === null || setting.updatedAt > latest ? setting.updatedAt : latest,
    null,
  );

  return {
    enterpriseNgn: fees.enterpriseNgn,
    ownerOperatorNgn: fees.ownerOperatorNgn,
    lastChangedAt: lastChangedAt?.toISOString() ?? null,
    priceHistory: recent.items.map(toPriceChangeView),
  };
}

@Injectable()
export class GetInstallationPriceUseCase {
  constructor(
    @Inject(BILLING_SETTINGS_REPOSITORY)
    private readonly settings: BillingSettingsRepository,
    @Inject(BILLING_PRICE_CHANGE_REPOSITORY)
    private readonly history: BillingPriceChangeRepository,
  ) {}

  async execute() {
    return success(await view(this.settings, this.history));
  }
}

@Injectable()
export class UpdateInstallationPriceUseCase {
  constructor(
    @Inject(BILLING_SETTINGS_REPOSITORY)
    private readonly settings: BillingSettingsRepository,
    @Inject(BILLING_PRICE_CHANGE_REPOSITORY)
    private readonly history: BillingPriceChangeRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(BILLING_AUDIT) private readonly audit: BillingAudit,
  ) {}

  async execute(actor: BillingActor, input: UpdateInstallationPriceInput) {
    const next: InstallationFees = {
      enterpriseNgn: requirePositiveInt('enterpriseNgn', input.enterpriseNgn),
      ownerOperatorNgn: requirePositiveInt('ownerOperatorNgn', input.ownerOperatorNgn),
    };
    const now = new Date();
    const effectiveDate = resolveEffectiveDate(input.effectiveDate, now);
    const applied: { changed: PriceDelta[]; reason?: string } = { changed: [] };

    await this.settings.editPriced(actor.userId, (stored) => {
      const deltas = this.deltas(installationFeesFrom(stored), next);
      applied.changed = realChanges(deltas);
      if (applied.changed.length === 0) return null;
      applied.reason = requireReason(input.reason);
      return this.edit(applied.changed, {
        actor,
        reason: applied.reason,
        effectiveDate,
        now,
      });
    });

    if (applied.reason !== undefined) {
      await this.recordAudit(actor, next, applied.changed, applied.reason, effectiveDate);
    }
    return success(await view(this.settings, this.history));
  }

  private deltas(current: InstallationFees, next: InstallationFees): PriceDelta[] {
    return [
      { field: 'enterprise', oldPriceNgn: current.enterpriseNgn, newPriceNgn: next.enterpriseNgn },
      { field: 'owner_operator', oldPriceNgn: current.ownerOperatorNgn, newPriceNgn: next.ownerOperatorNgn },
    ];
  }

  private edit(
    changed: PriceDelta[],
    ctx: { actor: BillingActor; reason: string; effectiveDate: string; now: Date },
  ): PricedSettingsEdit {
    const changes = toPriceChanges({
      deltas: changed,
      itemType: 'installation_fee',
      itemRef: ITEM_REF,
      effectiveDate: ctx.effectiveDate,
      reason: ctx.reason,
      actor: ctx.actor,
      now: ctx.now,
      nextId: () => this.ids.generate(),
    });
    const updates = changed.map((delta) => ({
      key:
        delta.field === 'enterprise'
          ? BILLING_SETTING_KEYS.installationFeeEnterprise
          : BILLING_SETTING_KEYS.installationFeeOwnerOperator,
      value: delta.newPriceNgn,
    }));
    return { updates, changes };
  }

  private async recordAudit(
    actor: BillingActor,
    next: InstallationFees,
    changed: PriceDelta[],
    reason: string,
    effectiveDate: string,
  ) {
    await this.audit.record(actor, {
      action: 'system.billing.installation_price_changed',
      entityType: 'billing_setting',
      entityId: ITEM_REF,
      summary: 'Installation price changed',
      metadata: {
        enterpriseNgn: next.enterpriseNgn,
        ownerOperatorNgn: next.ownerOperatorNgn,
        changes: changed,
        reason,
        effectiveDate,
      },
    });
  }
}
