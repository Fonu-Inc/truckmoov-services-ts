import { Migration } from '@mikro-orm/migrations';

/**
 * The indemnity agreement and the signatures given against it.
 *
 * A signature records the version and a hash of the exact wording that was on
 * screen, which is what makes it possible to prove later which words were
 * agreed to. Templates are therefore added, never edited.
 */
export class Migration20260922030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "onboarding_indemnity_templates" (
      "id" varchar(64) not null,
      "version" varchar(32) not null,
      "title" varchar(160) not null,
      "body" text not null,
      "body_hash" varchar(64) not null,
      "is_active" boolean not null default true,
      "created_at" timestamptz not null default now(),
      constraint "onboarding_indemnity_templates_pkey" primary key ("id")
    );`);
    this.addSql(
      `create unique index if not exists "onboarding_indemnity_templates_version_unique" on "onboarding_indemnity_templates" ("version");`,
    );

    this.addSql(`create table if not exists "onboarding_indemnity_signatures" (
      "id" varchar(64) not null,
      "application_id" varchar(64) not null,
      "template_version" varchar(32) not null,
      "template_hash" varchar(64) not null,
      "signer_name" varchar(160) not null,
      "method" varchar(16) not null,
      "file_key" varchar(512) not null,
      "mime_type" varchar(100) not null,
      "ip_address" varchar(64) null,
      "user_agent" varchar(512) null,
      "signed_at" timestamptz not null default now(),
      constraint "onboarding_indemnity_signatures_pkey" primary key ("id")
    );`);
    // One signature per application: signing again replaces the previous mark
    // rather than leaving two records of what was agreed.
    this.addSql(
      `create unique index if not exists "onboarding_indemnity_signatures_application_unique" on "onboarding_indemnity_signatures" ("application_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "onboarding_indemnity_signatures";`);
    this.addSql(`drop table if exists "onboarding_indemnity_templates";`);
  }
}
