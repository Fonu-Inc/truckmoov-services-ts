import { Migration } from '@mikro-orm/migrations';

/**
 * Two-factor sign-in becomes single use: `version` moves on with every use, so
 * a spent challenge cannot finish a second sign-in, and `last_used_step` stops
 * the same authenticator code being accepted twice.
 */
export class Migration20260925180000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "auth_two_factor_enrolments" add column if not exists "last_used_step" integer null;`);
    this.addSql(`alter table "auth_two_factor_enrolments" add column if not exists "version" integer not null default 0;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "auth_two_factor_enrolments" drop column if exists "version";`);
    this.addSql(`alter table "auth_two_factor_enrolments" drop column if exists "last_used_step";`);
  }
}
