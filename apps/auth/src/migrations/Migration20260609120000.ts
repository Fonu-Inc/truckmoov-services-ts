import { Migration } from '@mikro-orm/migrations';

export class Migration20260609120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "system_subscription_plans" ("id" varchar(255) not null, "code" varchar(80) not null, "tier" varchar(32) not null, "name" varchar(120) not null, "description" varchar(255) not null, "monthly_price_ngn" int null, "yearly_monthly_equivalent_ngn" int null, "yearly_discount_percent" int null, "max_active_vehicles" int null, "max_users" int null, "custom_pricing" boolean not null default false, "trial_days" int null, "badge" varchar(64) null, "cta_label" varchar(120) not null, "features" jsonb not null default '[]', "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "system_subscription_plans_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create unique index if not exists "system_subscription_plans_code_unique" on "system_subscription_plans" ("code");`,
    );
    this.addSql(
      `create index if not exists "system_subscription_plans_tier_index" on "system_subscription_plans" ("tier");`,
    );
    this.addSql(
      `create index if not exists "system_subscription_plans_is_active_index" on "system_subscription_plans" ("is_active");`,
    );
  }
}
