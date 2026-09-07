import { Migration } from '@mikro-orm/migrations';

/**
 * AI governance and the usage record behind it.
 *
 * Every model call leaves through one gateway, so one table can answer what
 * was spent, by whom, on what, and whether it worked. Prompt and response
 * bodies are nullable because they are only kept while an administrator has
 * turned that on.
 */
export class Migration20260907020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "ai_governance_settings" (
      "id" varchar(32) not null,
      "matching_enabled" boolean not null default false,
      "providers" jsonb not null default '[]'::jsonb,
      "rate_limits" jsonb not null default '{}'::jsonb,
      "data_protection" jsonb not null default '{}'::jsonb,
      "updated_by_user_id" varchar(64) null,
      "updated_at" timestamptz not null default now(),
      constraint "ai_governance_settings_pkey" primary key ("id")
    );`);

    this.addSql(`create table if not exists "ai_request_log" (
      "id" varchar(64) not null,
      "tenant_id" varchar(64) not null,
      "provider" varchar(32) not null,
      "model" varchar(96) not null,
      "feature" varchar(64) not null,
      "prompt_tokens" int not null default 0,
      "completion_tokens" int not null default 0,
      "total_tokens" int not null default 0,
      "latency_ms" int not null default 0,
      "succeeded" boolean not null default true,
      "error_message" text null,
      "prompt_body" text null,
      "response_body" text null,
      "created_at" timestamptz not null default now(),
      constraint "ai_request_log_pkey" primary key ("id")
    );`);
    // Both rate limits are per tenant over a time window, and the usage tab
    // groups by tenant and by provider. These are those two reads.
    this.addSql(
      `create index if not exists "ai_request_log_tenant_created_index" on "ai_request_log" ("tenant_id", "created_at");`,
    );
    this.addSql(
      `create index if not exists "ai_request_log_provider_created_index" on "ai_request_log" ("provider", "created_at");`,
    );
    this.addSql(
      `create index if not exists "ai_request_log_created_index" on "ai_request_log" ("created_at");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ai_request_log";`);
    this.addSql(`drop table if exists "ai_governance_settings";`);
  }
}
