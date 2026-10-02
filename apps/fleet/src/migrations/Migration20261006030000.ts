import { Migration } from "@mikro-orm/migrations";

/** Alerts survive restarts; devices whose Traccar registration failed are retried with backoff. */
export class Migration20261006030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "fleet_alerts" (
        "id" varchar(255) not null primary key,
        "tenant_id" varchar(64) not null,
        "type" varchar(128) not null,
        "severity" varchar(16) not null,
        "status" varchar(16) not null,
        "vehicle_id" varchar(255) null,
        "job_id" varchar(255) null,
        "details" jsonb not null default '{}'::jsonb,
        "triggered_at" timestamptz not null,
        "acknowledged_at" timestamptz null,
        "resolved_at" timestamptz null,
        "escalated_at" timestamptz null,
        "acknowledged_by" varchar(255) null,
        "resolved_by" varchar(255) null,
        "created_at" timestamptz not null default now()
      );
    `);
    this.addSql(
      `create index if not exists "fleet_alerts_tenant_created_idx" on "fleet_alerts" ("tenant_id", "created_at" desc);`,
    );
    this.addSql(
      `create index if not exists "fleet_alerts_open_triggered_idx" on "fleet_alerts" ("triggered_at") where "status" = 'open';`,
    );
    this.addSql(`alter table "fleet_devices" add column if not exists "provision_attempts" int not null default 0;`);
    this.addSql(`alter table "fleet_devices" add column if not exists "provision_next_attempt_at" timestamptz null;`);
    this.addSql(`alter table "fleet_devices" add column if not exists "provision_error" varchar(255) null;`);
    this.addSql(
      `create index if not exists "fleet_devices_provision_retry_idx" on "fleet_devices" ("provision_next_attempt_at") where "provision_status" = 'failed';`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "fleet_devices_provision_retry_idx";`);
    this.addSql(`alter table "fleet_devices" drop column if exists "provision_error";`);
    this.addSql(`alter table "fleet_devices" drop column if exists "provision_next_attempt_at";`);
    this.addSql(`alter table "fleet_devices" drop column if exists "provision_attempts";`);
    this.addSql(`drop table if exists "fleet_alerts";`);
  }
}
