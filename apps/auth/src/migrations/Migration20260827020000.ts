import { Migration } from "@mikro-orm/migrations";

/**
 * Platform security: authentication events, IP blocking, the rules that block
 * automatically, and structured security events.
 *
 * auth_events is written on every login, refresh and logout attempt —
 * success and failure — so it grows continuously. It carries no foreign key
 * to a user record on purpose: a failed login for an email that does not
 * exist is itself a signal the requirements name explicitly, and it must be
 * recorded the same as any other attempt.
 */
export class Migration20260827020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "auth_events" (
        "id" varchar(255) not null primary key,
        "tenant_id" varchar(64) null,
        "user_id" varchar(64) null,
        "email" varchar(255) null,
        "event_type" varchar(16) not null,
        "status" varchar(16) not null,
        "failure_reason" varchar(32) null,
        "ip_address" varchar(64) not null,
        "user_agent" text null,
        "occurred_at" timestamptz not null default now()
      )
    `);
    this.addSql(`
      create index if not exists "auth_events_occurred_at_index"
        on "auth_events" ("occurred_at")
    `);
    this.addSql(`
      create index if not exists "auth_events_tenant_occurred_index"
        on "auth_events" ("tenant_id", "occurred_at")
    `);
    // Read on every login-adjacent request while an IP is being evaluated
    // against the auto-block rules — this is the hot path.
    this.addSql(`
      create index if not exists "auth_events_ip_status_occurred_index"
        on "auth_events" ("ip_address", "status", "occurred_at")
    `);

    this.addSql(`
      create table if not exists "blocked_ips" (
        "id" varchar(255) not null primary key,
        "ip_address" varchar(64) not null,
        "reason" text not null,
        "block_type" varchar(16) not null,
        "blocked_at" timestamptz not null default now(),
        "expires_at" timestamptz null,
        "blocked_by" varchar(64) not null,
        "unblocked_at" timestamptz null,
        "unblocked_by" varchar(64) null
      )
    `);
    // A given address may be blocked, unblocked and blocked again over its
    // life, so this is not unique on ip_address alone — only one row may be
    // active for an address at a time, which the application enforces.
    this.addSql(`
      create index if not exists "blocked_ips_address_index"
        on "blocked_ips" ("ip_address")
    `);
    this.addSql(`
      create index if not exists "blocked_ips_active_index"
        on "blocked_ips" ("ip_address")
        where "unblocked_at" is null
    `);

    this.addSql(`
      create table if not exists "auto_block_rules" (
        "id" varchar(64) not null primary key,
        "name" varchar(64) not null,
        "enabled" boolean not null default true,
        "max_attempts" int not null,
        "window_minutes" int not null,
        "block_duration_hours" int null,
        "precedence" int not null,
        "updated_at" timestamptz not null default now(),
        "updated_by" varchar(64) null
      )
    `);

    // The three named rules from the reference build, with their stated
    // thresholds. Precedence is not shown there — the panel only says
    // whichever matches first triggers — so it is set here to the most
    // sensitive rule first: the rule that blocks on the fewest attempts.
    this.addSql(`
      insert into "auto_block_rules"
        ("id", "name", "enabled", "max_attempts", "window_minutes", "block_duration_hours", "precedence")
      values
        ('aggressive_protection', 'Aggressive Protection', true, 3, 10, 72, 1),
        ('standard_protection', 'Standard Protection', true, 5, 15, 24, 2),
        ('brute_force_prevention', 'Brute Force Prevention', true, 10, 60, null, 3)
      on conflict ("id") do nothing
    `);

    this.addSql(`
      create table if not exists "security_events" (
        "id" varchar(255) not null primary key,
        "event_type" varchar(32) not null,
        "severity" varchar(16) not null,
        "tenant_id" varchar(64) null,
        "summary" text not null,
        "related_entity_type" varchar(32) null,
        "related_entity_id" varchar(64) null,
        "metadata" jsonb not null default '{}',
        "occurred_at" timestamptz not null default now()
      )
    `);
    this.addSql(`
      create index if not exists "security_events_occurred_at_index"
        on "security_events" ("occurred_at")
    `);
    this.addSql(`
      create index if not exists "security_events_severity_occurred_index"
        on "security_events" ("severity", "occurred_at")
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "security_events"`);
    this.addSql(`drop table if exists "auto_block_rules"`);
    this.addSql(`drop table if exists "blocked_ips"`);
    this.addSql(`drop table if exists "auth_events"`);
  }
}
