import { Migration } from "@mikro-orm/migrations";

export class Migration20260326110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "fleet_devices" (
        "id" varchar(255) not null,
        "imei" varchar(32) not null,
        "manufacturer" varchar(64) not null,
        "model" varchar(64) not null,
        "firmware_version" varchar(32) not null,
        "tenant_id" varchar(64) not null,
        "status" varchar(32) not null default 'registered',
        "lifecycle_status" varchar(32) not null default 'registered',
        "vehicle_id" varchar(64) null,
        "signal_strength" int null,
        "battery_level" int null,
        "last_seen" timestamptz null,
        "assigned_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "fleet_devices_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      create unique index if not exists "fleet_devices_tenant_id_imei_unique"
      on "fleet_devices" ("tenant_id", "imei");
    `);
    this.addSql(`
      create index if not exists "fleet_devices_tenant_id_status_index"
      on "fleet_devices" ("tenant_id", "status");
    `);
    this.addSql(`
      create index if not exists "fleet_devices_tenant_id_lifecycle_status_index"
      on "fleet_devices" ("tenant_id", "lifecycle_status");
    `);
    this.addSql(`
      create index if not exists "fleet_devices_vehicle_id_index"
      on "fleet_devices" ("vehicle_id");
    `);
  }
}
