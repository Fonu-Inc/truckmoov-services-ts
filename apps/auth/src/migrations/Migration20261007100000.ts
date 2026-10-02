import { Migration } from '@mikro-orm/migrations';

const INDEXES: Array<[string, string, string]> = [
  ['auth_users_tenant_id_idx', 'auth_users', '"tenant_id"'],
  ['auth_sessions_user_id_idx', 'auth_sessions', '"user_id"'],
  ['auth_sessions_tenant_id_idx', 'auth_sessions', '"tenant_id"'],
  ['billing_quotations_tenant_id_idx', 'billing_quotations', '"tenant_id"'],
  ['onboarding_applications_tenant_id_idx', 'onboarding_applications', '"tenant_id"'],
  ['onboarding_payments_paid_at_idx', 'onboarding_payments', '"paid_at"'],
  ['wallet_top_ups_settled_at_idx', 'wallet_top_ups', '"settled_at"'],
];

export class Migration20261007100000 extends Migration {
  override async up(): Promise<void> {
    for (const [name, table, columns] of INDEXES) {
      this.addSql(`create index if not exists "${name}" on "${table}" (${columns});`);
    }
  }

  override async down(): Promise<void> {
    for (const [name] of INDEXES) this.addSql(`drop index if exists "${name}";`);
  }
}
