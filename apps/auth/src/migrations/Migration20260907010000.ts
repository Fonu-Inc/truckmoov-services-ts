import { Migration } from '@mikro-orm/migrations';

/**
 * Retires the platform's two private copies of a device request.
 *
 * A tenant submits a request in the fleet service. `device_setup_requests` was
 * the platform's own table, so the approval queue read rows nothing ever wrote,
 * and `tenant_device_provisioning_requests` was written by onboarding and read
 * by nothing at all. The platform now reads the tenant's own request.
 */
export class Migration20260907010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`drop table if exists "device_setup_requests";`);
    this.addSql(`drop table if exists "tenant_device_provisioning_requests";`);
  }

  override async down(): Promise<void> {
    // Recreated empty. The rows are not restorable and were never the source of
    // truth for anything, so a rollback gets the shape back and nothing else.
    this.addSql(`create table if not exists "device_setup_requests" (
      "id" varchar(64) not null,
      "imei" varchar(32) not null,
      "manufacturer" varchar(64) not null,
      "model" varchar(64) not null,
      "connection_type" varchar(16) not null,
      "requester_name" varchar(255) not null,
      "needs_sim" boolean not null default false,
      "vehicle_plate" varchar(255) null,
      "location" varchar(255) null,
      "tenant_id" varchar(64) not null,
      "status" varchar(32) not null default 'pending_review',
      "assigned_to" varchar(64) null,
      "notes" text null,
      "preferred_install_date" timestamptz null,
      "rejected_reason" text null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "device_setup_requests_pkey" primary key ("id")
    );`);
    this.addSql(`create table if not exists "tenant_device_provisioning_requests" (
      "id" varchar(64) not null,
      "tenant_id" varchar(64) not null,
      "manufacturer" varchar(128) not null,
      "model" varchar(128) not null,
      "quantity" int not null default 1,
      "use_case" text null,
      "requester_notes" text null,
      "status" varchar(32) not null default 'pending',
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "tenant_device_provisioning_requests_pkey" primary key ("id")
    );`);
  }
}
