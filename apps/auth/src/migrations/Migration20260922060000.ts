import { Migration } from '@mikro-orm/migrations';

/**
 * How far along an onboarding is, separate from what was decided about it.
 *
 * `status` answers whether the application was accepted; `stage` answers where
 * the customer has reached. They were one column while the flow ended at
 * approval, and cannot stay one now that approval is the middle of the journey.
 *
 * Existing rows keep `application`: an approved application from before this
 * change has a tenant but none of the stages after it, which is exactly what
 * the default says.
 */
export class Migration20260922060000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "onboarding_applications" add column if not exists "stage" varchar(32) not null default 'application';`,
    );
    this.addSql(
      `create index if not exists "onboarding_applications_stage_index" on "onboarding_applications" ("stage");`,
    );
    // Approved applications predating the column are past the application
    // stage by definition: a tenant exists for them.
    this.addSql(
      `update "onboarding_applications" set "stage" = 'provisioning' where "status" = 'approved' and "stage" = 'application';`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "onboarding_applications_stage_index";`);
    this.addSql(
      `alter table "onboarding_applications" drop column if exists "stage";`,
    );
  }
}
