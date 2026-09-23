import { Migration } from '@mikro-orm/migrations';

/**
 * Refresh-token families. Rotating a token spends it rather than deleting it,
 * so a spent token presented again is recognised as stolen and its whole
 * session ended.
 */
export class Migration20260923030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "auth_sessions" add column if not exists "family_id" varchar(64) null;`);
    this.addSql(`alter table "auth_sessions" add column if not exists "spent_at" timestamptz null;`);
    this.addSql(
      `create index if not exists "auth_sessions_family_index" on "auth_sessions" ("family_id") where "family_id" is not null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "auth_sessions_family_index";`);
    this.addSql(`alter table "auth_sessions" drop column if exists "spent_at";`);
    this.addSql(`alter table "auth_sessions" drop column if exists "family_id";`);
  }
}
