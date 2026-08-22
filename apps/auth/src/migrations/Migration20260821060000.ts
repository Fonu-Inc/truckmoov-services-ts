import { Migration } from '@mikro-orm/migrations';

export class Migration20260821060000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "wallet_ledger_entries" (
        "id" varchar(255) not null primary key,
        -- Two entries can share a timestamp. The statement needs a total order,
        -- so ordering uses this rather than created_at.
        "seq" bigserial not null,
        "tenant_id" varchar(64) not null,
        "direction" varchar(16) not null,
        "category" varchar(32) not null,
        "amount_kobo" bigint not null,
        "balance_after_kobo" bigint not null,
        "unit_rate_kobo" bigint not null default 0,
        "quantity" int not null default 1,
        "reason" varchar(255) not null,
        "reference" varchar(255) null,
        "created_at" timestamptz not null default now()
      );
    `);
    this.addSql(
      `create index if not exists "wallet_ledger_entries_tenant_idx" on "wallet_ledger_entries" ("tenant_id", "seq" desc);`,
    );
    this.addSql(
      `create index if not exists "wallet_ledger_entries_category_idx" on "wallet_ledger_entries" ("tenant_id", "category");`,
    );

    // A ledger that can be edited after the fact is not a ledger. The running
    // balance on each row is only meaningful if the row cannot change.
    this.addSql(`revoke update, delete on "wallet_ledger_entries" from public;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "wallet_ledger_entries";`);
  }
}
