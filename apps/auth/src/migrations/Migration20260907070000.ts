import { Migration } from '@mikro-orm/migrations';

/**
 * Whether the setup link reached the applicant.
 *
 * `sent` means the mail transport accepted the message, not that anybody
 * received it — there is no bounce feedback yet, so a message accepted and
 * then rejected downstream still reads as sent. The admin screen shows a
 * failure row only for a send that actually failed.
 */
export class Migration20260907070000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "onboarding_applications" add column if not exists "setup_link_status" varchar(16) null;`,
    );
    this.addSql(
      `alter table "onboarding_applications" add column if not exists "setup_link_sent_at" timestamptz null;`,
    );
    this.addSql(
      `alter table "onboarding_applications" add column if not exists "setup_link_error" text null;`,
    );
    this.addSql(
      `alter table "onboarding_applications" add column if not exists "setup_link_attempts" int not null default 0;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "onboarding_applications" drop column if exists "setup_link_attempts";`);
    this.addSql(`alter table "onboarding_applications" drop column if exists "setup_link_error";`);
    this.addSql(`alter table "onboarding_applications" drop column if exists "setup_link_sent_at";`);
    this.addSql(`alter table "onboarding_applications" drop column if exists "setup_link_status";`);
  }
}
