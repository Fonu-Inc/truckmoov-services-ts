import { Migration } from '@mikro-orm/migrations';

/**
 * What an application claims identifies it, so two applications can be
 * compared on something harder to change than an email address.
 *
 * Deliberately not a unique index: a claim only blocks while the application
 * holding it is still alive, and a rejected application keeps its rows so the
 * decision stays explainable. The check is therefore a lookup, not a
 * constraint.
 */
export class Migration20260922040000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "onboarding_application_documents" add column if not exists "file_hash" varchar(64) null;`,
    );
    this.addSql(
      `create index if not exists "onboarding_application_documents_file_hash_index" on "onboarding_application_documents" ("file_hash");`,
    );

    this.addSql(`create table if not exists "onboarding_identity_claims" (
      "id" varchar(64) not null,
      "application_id" varchar(64) not null,
      "claim_type" varchar(40) not null,
      "claim_value" varchar(128) not null,
      "created_at" timestamptz not null default now(),
      constraint "onboarding_identity_claims_pkey" primary key ("id")
    );`);
    this.addSql(
      `create index if not exists "onboarding_identity_claims_application_id_index" on "onboarding_identity_claims" ("application_id");`,
    );
    this.addSql(
      `create index if not exists "onboarding_identity_claims_lookup_index" on "onboarding_identity_claims" ("claim_type", "claim_value");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "onboarding_identity_claims";`);
    this.addSql(
      `drop index if exists "onboarding_application_documents_file_hash_index";`,
    );
    this.addSql(
      `alter table "onboarding_application_documents" drop column if exists "file_hash";`,
    );
  }
}
