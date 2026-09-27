import { Migration } from '@mikro-orm/migrations';

/**
 * A per-account cooldown on two-factor codes: after three wrong codes in a row
 * `codes_blocked_until` refuses every code for a minute, unchecked, and the
 * count starts again.
 */
export class Migration20260927120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "auth_two_factor_enrolments" add column if not exists "failed_code_count" integer not null default 0;`);
    this.addSql(`alter table "auth_two_factor_enrolments" add column if not exists "codes_blocked_until" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "auth_two_factor_enrolments" drop column if exists "codes_blocked_until";`);
    this.addSql(`alter table "auth_two_factor_enrolments" drop column if exists "failed_code_count";`);
  }
}
