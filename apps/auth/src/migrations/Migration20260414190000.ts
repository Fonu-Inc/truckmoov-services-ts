import { Migration } from '@mikro-orm/migrations';

export class Migration20260414190000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "system_settings" ("id" varchar(255) not null, "platform_name" varchar(160) not null, "support_email" varchar(255) not null, "defaults" jsonb not null, "features" jsonb not null, "retention" jsonb not null, "updated_by_user_id" varchar(64) null, "updated_at" timestamptz not null default now(), constraint "system_settings_pkey" primary key ("id"));`,
    );

    this.addSql(
      `create table if not exists "system_feature_flags" ("id" varchar(255) not null, "scope" varchar(32) not null default 'platform', "tenant_id" varchar(64) null, "feature_key" varchar(120) not null, "feature_name" varchar(160) not null, "feature_description" text null, "is_enabled" boolean not null default false, "rollout_percentage" int not null default 100, "category" varchar(64) not null, "phase" varchar(32) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "system_feature_flags_pkey" primary key ("id"));`,
    );
    this.addSql(
      `do $$ begin if not exists (select 1 from pg_constraint where conname = 'system_feature_flags_feature_key_unique') then alter table "system_feature_flags" add constraint "system_feature_flags_feature_key_unique" unique ("feature_key"); end if; end $$;`,
    );
    this.addSql(
      `create index if not exists "system_feature_flags_scope_index" on "system_feature_flags" ("scope");`,
    );
    this.addSql(
      `create index if not exists "system_feature_flags_category_index" on "system_feature_flags" ("category");`,
    );
    this.addSql(
      `create index if not exists "system_feature_flags_phase_index" on "system_feature_flags" ("phase");`,
    );
  }
}
