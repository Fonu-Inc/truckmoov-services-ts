import { Migration } from "@mikro-orm/migrations";

/**
 * Violation rules and the violations they raise (tech-debt TD-23). A violation
 * is a behaviour event or GPS reading that broke an active rule, not every raw
 * event; `dedupe_key` keeps a repeated fix or event from counting twice.
 */
export class Migration20261123090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "violation_rules" (
      "id" varchar(64) primary key,
      "tenant_id" varchar(64) not null,
      "entity" varchar(16) not null,
      "name" varchar(80) not null,
      "description" varchar(240) null,
      "type" varchar(32) not null,
      "trigger" jsonb not null default '{}',
      "scope" varchar(32) not null,
      "scope_ids" jsonb not null default '[]',
      "schedule" jsonb not null default '{"mode":"always"}',
      "severity" varchar(16) not null,
      "quota" integer not null,
      "quota_period" varchar(16) not null,
      "repeat_threshold" integer not null,
      "notify" boolean not null default true,
      "status" varchar(16) not null default 'active',
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now()
    );`);
    this.addSql(`create index if not exists "violation_rules_tenant_status_index" on "violation_rules" ("tenant_id", "status");`);
    this.addSql(`create table if not exists "violations" (
      "id" varchar(64) primary key,
      "tenant_id" varchar(64) not null,
      "rule_id" varchar(64) not null,
      "rule_name" varchar(80) not null,
      "entity" varchar(16) not null,
      "type" varchar(32) not null,
      "driver_id" varchar(255) null,
      "vehicle_id" varchar(64) null,
      "recorded_value" varchar(120) not null,
      "threshold" varchar(120) not null,
      "severity" varchar(16) not null,
      "latitude" double precision null,
      "longitude" double precision null,
      "occurred_at" timestamptz not null,
      "status" varchar(16) not null default 'open',
      "dedupe_key" varchar(160) not null,
      "created_at" timestamptz not null default now()
    );`);
    this.addSql(`create unique index if not exists "violations_dedupe_unique" on "violations" ("tenant_id", "rule_id", "dedupe_key");`);
    this.addSql(`create index if not exists "violations_tenant_time_index" on "violations" ("tenant_id", "occurred_at" desc);`);
    this.addSql(`create table if not exists "violation_streaks" (
      "tenant_id" varchar(64) not null,
      "rule_id" varchar(64) not null,
      "vehicle_id" varchar(64) not null,
      "started_at" timestamptz not null,
      primary key ("tenant_id", "rule_id", "vehicle_id")
    );`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "violation_streaks";`);
    this.addSql(`drop table if exists "violations";`);
    this.addSql(`drop table if exists "violation_rules";`);
  }
}
