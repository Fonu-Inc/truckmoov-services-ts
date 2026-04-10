import { Migration } from '@mikro-orm/migrations';

export class Migration20260410103000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "system_device_models" ("id" varchar(255) not null, "manufacturer" varchar(120) not null, "model" varchar(120) not null, "protocol_type" varchar(16) not null, "default_port" int null, "supported_features" jsonb not null default '[]', "status" varchar(32) not null default 'supported', "configuration_instructions" text null, "created_by_user_id" varchar(64) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "system_device_models_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create unique index if not exists "system_device_models_manufacturer_model_unique" on "system_device_models" ("manufacturer", "model");`,
    );
    this.addSql(
      `create index if not exists "system_device_models_manufacturer_index" on "system_device_models" ("manufacturer");`,
    );
    this.addSql(
      `create index if not exists "system_device_models_status_index" on "system_device_models" ("status");`,
    );
    this.addSql(
      `create index if not exists "system_device_models_created_at_index" on "system_device_models" ("created_at");`,
    );
    this.addSql(
      `create index if not exists "system_device_models_updated_at_index" on "system_device_models" ("updated_at");`,
    );
  }
}
