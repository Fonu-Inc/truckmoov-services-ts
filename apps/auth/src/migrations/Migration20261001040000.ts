import { Migration } from '@mikro-orm/migrations';

export class Migration20261001040000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "bundle_allocations" add column if not exists "payment_reference" varchar(255) null;`);
    this.addSql(`create index if not exists "bundle_allocations_tenant_payment_reference_idx"
      on "bundle_allocations" ("tenant_id", "payment_reference");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "bundle_allocations_tenant_payment_reference_idx";`);
    this.addSql(`alter table "bundle_allocations" drop column if exists "payment_reference";`);
  }
}
