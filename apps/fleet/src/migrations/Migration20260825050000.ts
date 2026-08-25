import { Migration } from "@mikro-orm/migrations";

/**
 * Device installation and verification.
 *
 * Verification cannot be a synchronous check: nothing the platform does makes
 * a tracker report. It configures, then waits, then times out. That waiting is
 * a state on the device with a deadline against it.
 *
 * configured_at is what the installer queue reads to show how long a device has
 * been waiting. Without it the screen can only say "Unknown".
 */
export class Migration20260825050000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "fleet_devices"
        add column if not exists "protocol" varchar(16) null,
        add column if not exists "port" int null,
        add column if not exists "configured_at" timestamptz null,
        add column if not exists "verification_status" varchar(16) null,
        add column if not exists "verification_deadline" timestamptz null,
        add column if not exists "verification_error" text null,
        add column if not exists "verified_at" timestamptz null
    `);

    this.addSql(`
      create index if not exists "fleet_devices_verification_status_index"
        on "fleet_devices" ("tenant_id", "verification_status")
    `);
    this.addSql(`
      create index if not exists "fleet_devices_verification_deadline_index"
        on "fleet_devices" ("verification_deadline")
        where "verification_deadline" is not null
    `);

    this.addSql(`
      create table if not exists "fleet_device_verification_failures" (
        "id" varchar(255) not null primary key,
        "tenant_id" varchar(64) not null,
        "device_id" varchar(64) not null,
        "imei" varchar(32) not null,
        "reason" varchar(64) not null,
        "detail" text null,
        "raw_payload" text null,
        "source_address" varchar(64) null,
        "created_at" timestamptz not null default now()
      )
    `);
    this.addSql(`
      create index if not exists "fleet_device_verification_failures_device_index"
        on "fleet_device_verification_failures" ("tenant_id", "device_id")
    `);
    this.addSql(`
      create index if not exists "fleet_device_verification_failures_created_index"
        on "fleet_device_verification_failures" ("created_at")
    `);

    // Devices already sitting at verified_online were marked by hand before
    // there was any evidence to record. Their verification reads as verified so
    // the queue does not ask an installer to re-verify a working tracker.
    this.addSql(`
      update "fleet_devices"
      set "verification_status" = 'verified',
          "verified_at" = coalesce("last_seen", "updated_at")
      where "lifecycle_status" in ('verified_online', 'assignable', 'assigned')
        and "verification_status" is null
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_device_verification_failures"`);
    this.addSql(`
      alter table "fleet_devices"
        drop column if exists "protocol",
        drop column if exists "port",
        drop column if exists "configured_at",
        drop column if exists "verification_status",
        drop column if exists "verification_deadline",
        drop column if exists "verification_error",
        drop column if exists "verified_at"
    `);
  }
}
