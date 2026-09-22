import { Migration } from '@mikro-orm/migrations';

/**
 * What each registry answered about an application.
 *
 * Kept so an automated decision stays arguable: which registry was asked, what
 * it said, which fields were compared and when. Without these rows an approval
 * is a status change nobody can explain months later.
 */
export class Migration20260922050000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "onboarding_verification_results" (
      "id" varchar(64) not null,
      "application_id" varchar(64) not null,
      "check" varchar(40) not null,
      "verdict" varchar(20) not null,
      "reference" varchar(128) not null,
      "summary" text not null,
      "fields" jsonb not null default '[]'::jsonb,
      "provider" varchar(40) not null,
      "checked_at" timestamptz not null default now(),
      constraint "onboarding_verification_results_pkey" primary key ("id")
    );`);
    this.addSql(
      `create index if not exists "onboarding_verification_results_application_id_index" on "onboarding_verification_results" ("application_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "onboarding_verification_results";`);
  }
}
