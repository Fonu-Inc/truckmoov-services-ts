import { Migration } from "@mikro-orm/migrations";

export class Migration20260619000003 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "fleet_maintenance_records" (
        "id" varchar(255) not null primary key,
        "tenant_id" varchar(64) not null,
        "vehicle_id" varchar(255) not null,
        "maintenance_type" varchar(64) not null,
        "description" text null,
        "status" varchar(32) not null default 'scheduled',
        "priority" varchar(16) not null default 'medium',
        "scheduled_date" date null,
        "completed_date" date null,
        "cost" numeric(12,2) null,
        "currency" varchar(8) not null default 'NGN',
        "technician" varchar(255) null,
        "notes" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      );
    `);
    this.addSql(`create index if not exists "fleet_maintenance_records_tenant_idx" on "fleet_maintenance_records" ("tenant_id");`);
    this.addSql(`create index if not exists "fleet_maintenance_records_vehicle_idx" on "fleet_maintenance_records" ("vehicle_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_maintenance_records";`);
  }
}
