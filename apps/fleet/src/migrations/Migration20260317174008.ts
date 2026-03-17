import { Migration } from '@mikro-orm/migrations';

export class Migration20260317174008 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fleet_drivers" ("id" varchar(255) not null, "name" varchar(128) not null, "license_number" varchar(64) not null, "tenant_id" varchar(64) not null, "status" varchar(16) not null default 'active', "assigned_vehicle_id" varchar(64) null, "whatsapp_number" varchar(32) null, "sms_number" varchar(32) null, "voice_number" varchar(32) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "fleet_drivers_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "fleet_drivers_tenant_id_license_number_index" on "fleet_drivers" ("tenant_id", "license_number");`);
    this.addSql(`create index if not exists "fleet_drivers_tenant_id_status_index" on "fleet_drivers" ("tenant_id", "status");`);
    this.addSql(`create index if not exists "fleet_drivers_assigned_vehicle_id_index" on "fleet_drivers" ("assigned_vehicle_id");`);

    this.addSql(`create table if not exists "fleet_jobs" ("job_id" varchar(255) not null, "tenant_id" varchar(64) not null, "status" varchar(32) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "fleet_jobs_pkey" primary key ("job_id"));`);
    this.addSql(`create index if not exists "fleet_jobs_tenant_id_status_index" on "fleet_jobs" ("tenant_id", "status");`);

    this.addSql(`create table if not exists "fleet_vehicles" ("id" varchar(255) not null, "plate_number" varchar(64) not null, "model" varchar(128) not null, "tenant_id" varchar(64) not null, "status" varchar(16) not null default 'active', "assigned_driver_id" varchar(64) null, "gps_device_id" varchar(128) null, "gps_provider" varchar(128) null, "gps_serial_number" varchar(128) null, "gps_installed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "fleet_vehicles_pkey" primary key ("id"));`);
    this.addSql(`create index if not exists "fleet_vehicles_tenant_id_plate_number_index" on "fleet_vehicles" ("tenant_id", "plate_number");`);
    this.addSql(`create index if not exists "fleet_vehicles_tenant_id_status_index" on "fleet_vehicles" ("tenant_id", "status");`);
    this.addSql(`create index if not exists "fleet_vehicles_assigned_driver_id_index" on "fleet_vehicles" ("assigned_driver_id");`);
  }

}
