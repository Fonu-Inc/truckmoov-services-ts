import { Migration } from "@mikro-orm/migrations";

/**
 * The platform's decision on a device request now lives with the request the
 * tenant submitted. The admin queue previously read a separate table nothing
 * wrote to, so a decision had nowhere to land.
 */
export class Migration20260907020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "fleet_device_setup_requests" add column if not exists "assigned_to" varchar(64) null;`,
    );
    this.addSql(
      `alter table "fleet_device_setup_requests" add column if not exists "decided_by" varchar(64) null;`,
    );
    this.addSql(
      `alter table "fleet_device_setup_requests" add column if not exists "decided_at" timestamptz null;`,
    );
    this.addSql(
      `alter table "fleet_device_setup_requests" add column if not exists "decision_reason" varchar(1000) null;`,
    );
    // The platform queue reads across tenants, ordered oldest first.
    this.addSql(
      `create index if not exists "fleet_device_setup_requests_status_created_index" on "fleet_device_setup_requests" ("status", "created_at");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "fleet_device_setup_requests_status_created_index";`);
    this.addSql(`alter table "fleet_device_setup_requests" drop column if exists "decision_reason";`);
    this.addSql(`alter table "fleet_device_setup_requests" drop column if exists "decided_at";`);
    this.addSql(`alter table "fleet_device_setup_requests" drop column if exists "decided_by";`);
    this.addSql(`alter table "fleet_device_setup_requests" drop column if exists "assigned_to";`);
  }
}
