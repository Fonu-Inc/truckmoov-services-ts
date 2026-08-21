import { Migration } from '@mikro-orm/migrations';

export class Migration20260821010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "wallet_top_ups" add column if not exists "settled_at" timestamptz null;`,
    );

    // Any already-settled row predates settlement tracking, so stamp it from
    // created_at rather than leaving a successful top-up with no settled time.
    this.addSql(
      `update "wallet_top_ups" set settled_at = created_at where status = 'success' and settled_at is null;`,
    );

    // Collapse pre-existing duplicate references, keeping the earliest row per
    // reference, so the unique index below can be created.
    this.addSql(`
      delete from "wallet_top_ups" a
      using "wallet_top_ups" b
      where a.reference is not null
        and b.reference is not null
        and a.reference = b.reference
        and (
          a.created_at > b.created_at
          or (a.created_at = b.created_at and a.id > b.id)
        );
    `);

    this.addSql(`
      create unique index if not exists "wallet_top_ups_reference_uidx"
      on "wallet_top_ups" (reference)
      where reference is not null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "wallet_top_ups_reference_uidx";`);
    this.addSql(
      `alter table "wallet_top_ups" drop column if exists "settled_at";`,
    );
  }
}
