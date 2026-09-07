import { Migration } from '@mikro-orm/migrations';

/**
 * Two-factor enrolments, one per user.
 *
 * The secret is encrypted at rest: a leaked row must not yield working codes.
 * `confirmed_at` stays null until the first correct code proves the
 * authenticator was actually set up, so a half-finished enrolment cannot lock
 * anybody out.
 */
export class Migration20260907040000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "auth_two_factor_enrolments" (
      "user_id" varchar(64) not null,
      "secret_ciphertext" text not null,
      "confirmed_at" timestamptz null,
      "recovery_code_hashes" jsonb not null default '[]'::jsonb,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "auth_two_factor_enrolments_pkey" primary key ("user_id")
    );`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "auth_two_factor_enrolments";`);
  }
}
