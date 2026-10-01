import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import {
  getAuthOrm,
  SystemTenantOnboardingRecord,
} from './contexts/auth/session/infrastructure/persistence/auth-orm';
import {
  type PendingSubscriptionCharge,
  type StoredTenantOnboarding,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

function toStored(
  record: SystemTenantOnboardingRecord,
): StoredTenantOnboarding {
  return {
    ...record,
    organizationType:
      record.organizationType as StoredTenantOnboarding['organizationType'],
    bootstrapRole: record.bootstrapRole,
    company: record.company as StoredTenantOnboarding['company'],
    subscription: record.subscription as StoredTenantOnboarding['subscription'],
    deviceProvisioning:
      record.deviceProvisioning as StoredTenantOnboarding['deviceProvisioning'],
    simAssignment:
      record.simAssignment as StoredTenantOnboarding['simAssignment'],
    features: record.features as StoredTenantOnboarding['features'],
    status: record.status as StoredTenantOnboarding['status'],
  };
}

const APPEND_PENDING_CHARGE_SQL = `
  update system_tenant_onboardings
  set subscription = jsonb_set(
        subscription,
        '{pendingCharges}',
        (select coalesce(jsonb_agg(kept.charge order by kept.pos), '[]'::jsonb)
           from (select t.charge, t.pos
                   from jsonb_array_elements(
                          coalesce(subscription->'pendingCharges', '[]'::jsonb) || ?::jsonb
                        ) with ordinality as t(charge, pos)
                  order by t.pos desc
                  limit ?) kept),
        true),
      updated_at = ?
  where tenant_id = ?`;

const ACTIVATE_SUBSCRIPTION_SQL = `
  update system_tenant_onboardings
  set subscription = jsonb_build_object('planCode', ?::text, 'billingCycle', ?::text)
        || coalesce(
             (select jsonb_build_object('pendingCharges', jsonb_agg(p.charge))
                from jsonb_array_elements(coalesce(subscription->'pendingCharges', '[]'::jsonb)) as p(charge)
               where p.charge->>'reference' <> ?
              having count(*) > 0),
             '{}'::jsonb),
      payment_reference = ?,
      subscription_activated_at = ?,
      updated_at = ?
  where tenant_id = ?
    and (subscription_activated_at is null or payment_reference is distinct from ?)
    and coalesce(subscription->>'planCode', '') in ('', ?)`;

@Injectable()
export class MikroTenantOnboardingRepository implements TenantOnboardingRepository {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async save(onboarding: StoredTenantOnboarding): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.upsert(SystemTenantOnboardingRecord, {
      ...onboarding,
      updatedAt: onboarding.updatedAt,
    });
  }

  async appendPendingCharge(
    tenantId: string,
    charge: PendingSubscriptionCharge,
    maxPending: number,
  ): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    await orm.em.getConnection().execute(
      APPEND_PENDING_CHARGE_SQL,
      [JSON.stringify(charge), maxPending, new Date(), tenantId],
      'run',
    );
  }

  async activateSubscription(
    tenantId: string,
    charge: PendingSubscriptionCharge,
    activatedAt: Date,
  ): Promise<boolean> {
    const orm = await getAuthOrm(this.config.db);
    const result = (await orm.em.getConnection().execute(
      ACTIVATE_SUBSCRIPTION_SQL,
      [
        charge.planCode,
        charge.billingCycle,
        charge.reference,
        charge.reference,
        activatedAt,
        activatedAt,
        tenantId,
        charge.reference,
        charge.planCode,
      ],
      'run',
    )) as unknown as { affectedRows: number };
    return result.affectedRows > 0;
  }

  async findByTenantId(
    tenantId: string,
  ): Promise<StoredTenantOnboarding | null> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const record = await em.findOne(SystemTenantOnboardingRecord, { tenantId });
    return record ? toStored(record) : null;
  }

  async findAll(): Promise<StoredTenantOnboarding[]> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    const records = await em.find(
      SystemTenantOnboardingRecord,
      {},
      {
        orderBy: { createdAt: 'desc' },
      },
    );
    return records.map((record) => toStored(record));
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    const orm = await getAuthOrm(this.config.db);
    const em = orm.em.fork();
    await em.nativeDelete(SystemTenantOnboardingRecord, { tenantId });
  }
}
