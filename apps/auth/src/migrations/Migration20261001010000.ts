import { Migration } from '@mikro-orm/migrations';

export class Migration20261001010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "wallet_ledger_entries" add column if not exists "idempotency_key" varchar(160) null;`,
    );
    this.addSql(`create unique index if not exists "wallet_ledger_entries_idempotency_unique"
      on "wallet_ledger_entries" ("tenant_id", "idempotency_key")
      where "idempotency_key" is not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "wallet_ledger_entries_idempotency_unique";`);
    this.addSql(`alter table "wallet_ledger_entries" drop column if exists "idempotency_key";`);
  }
}
