import { Migration } from '@mikro-orm/migrations';

/**
 * The M2M licence catalogue, and the plan an application chose.
 *
 * Rows are seeded at boot rather than here so a price edited from the admin
 * screens is never written back over by a deploy.
 */
export class Migration20260922020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "m2m_license_plans" (
      "id" varchar(64) not null,
      "code" varchar(64) not null,
      "name" varchar(120) not null,
      "description" varchar(255) not null,
      "per_device_year1_ngn" int not null,
      "per_device_renewal_ngn" int not null,
      "sort_order" int not null default 0,
      "is_active" boolean not null default true,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "m2m_license_plans_pkey" primary key ("id")
    );`);
    this.addSql(
      `create unique index if not exists "m2m_license_plans_code_unique" on "m2m_license_plans" ("code");`,
    );

    this.addSql(
      `alter table "onboarding_applications" add column if not exists "m2m_plan_code" varchar(64) null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "onboarding_applications" drop column if exists "m2m_plan_code";`,
    );
    this.addSql(`drop table if exists "m2m_license_plans";`);
  }
}
