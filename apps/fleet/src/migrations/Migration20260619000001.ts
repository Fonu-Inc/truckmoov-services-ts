import { Migration } from "@mikro-orm/migrations";

export class Migration20260619000001 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "fleet_maintenance_profiles" (
        "id" varchar(255) not null primary key,
        "tenant_id" varchar(64) not null,
        "vehicle_id" varchar(255) not null,
        "service_type" varchar(64) not null,
        "service_label" varchar(255) not null,
        "interval_type" varchar(16) not null default 'date',
        "interval_days" int null,
        "interval_months" int null,
        "interval_km" int null,
        "last_service_date" date null,
        "last_service_mileage" int null,
        "current_mileage" int null,
        "mileage_source" varchar(16) not null default 'manual',
        "next_due_date" date null,
        "next_due_mileage" int null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      );
    `);
    this.addSql(`create index if not exists "fleet_maintenance_profiles_tenant_idx" on "fleet_maintenance_profiles" ("tenant_id");`);
    this.addSql(`create index if not exists "fleet_maintenance_profiles_vehicle_idx" on "fleet_maintenance_profiles" ("vehicle_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_maintenance_profiles";`);
  }
}
