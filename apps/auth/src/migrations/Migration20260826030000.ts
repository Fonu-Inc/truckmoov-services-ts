import { Migration } from "@mikro-orm/migrations";

/**
 * Credit settings on the tenant wallet.
 *
 * Until now a wallet could not go below zero and nothing warned a tenant it was
 * running out. The platform was charging for every message sent with no ceiling
 * and no notice.
 *
 * The credit limit is nullable on purpose. Null means unlimited; zero means no
 * headroom. Treating an unset limit as zero would refuse every tenant nobody
 * had configured yet, which the requirements call out by name.
 */
export class Migration20260826030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "tenant_wallets"
        add column if not exists "credit_enabled" boolean not null default false,
        add column if not exists "credit_limit_kobo" bigint null,
        add column if not exists "low_balance_threshold_kobo" bigint not null default 0
    `);

    // Existing wallets get the reference build's lower threshold rather than
    // zero: a threshold of zero would mean no wallet is ever reported low, and
    // the whole point of the column is the warning.
    this.addSql(`
      update "tenant_wallets"
      set "low_balance_threshold_kobo" = ${200_000 * 100}
      where "low_balance_threshold_kobo" = 0
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "tenant_wallets"
        drop column if exists "credit_enabled",
        drop column if exists "credit_limit_kobo",
        drop column if exists "low_balance_threshold_kobo"
    `);
  }
}
