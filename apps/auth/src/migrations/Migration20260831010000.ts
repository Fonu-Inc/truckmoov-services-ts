import { Migration } from '@mikro-orm/migrations';

export class Migration20260831010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "platform_integration_credentials" ("service_key" varchar(80) not null, "category" varchar(64) not null, "enabled" boolean not null default true, "secret_ciphertext" text null, "secret_preview" varchar(32) null, "config" jsonb not null default '{}'::jsonb, "status" varchar(32) not null, "last_tested_at" timestamptz null, "last_error" text null, "updated_at" timestamptz not null default now(), constraint "platform_integration_credentials_pkey" primary key ("service_key"));`);
    this.addSql(`create index if not exists "platform_integration_credentials_category_index" on "platform_integration_credentials" ("category");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "platform_integration_credentials";`);
  }
}
