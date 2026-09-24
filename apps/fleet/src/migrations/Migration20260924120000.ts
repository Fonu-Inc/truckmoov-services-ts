import { Migration } from "@mikro-orm/migrations";

/**
 * Fuel records lived in a per-pod map, so with more than one replica a record
 * was visible only to the pod that took the POST, and every deploy lost them.
 */
export class Migration20260924120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fleet_fuel_records" (
      "id" varchar(255) not null,
      "tenant_id" varchar(64) not null,
      "vehicle_id" varchar(255) not null,
      "driver_id" varchar(255) null,
      "vehicle_type" varchar(64) null,
      "fuel_type" varchar(16) null,
      "liters" numeric(12,3) not null,
      "price_per_liter" numeric(14,2) not null,
      "total_cost" numeric(14,2) not null,
      "station" varchar(255) null,
      "odometer" numeric(14,2) null,
      "recorded_at" timestamptz not null,
      "recorded_by" varchar(255) not null,
      "deleted_at" timestamptz null,
      "audit_trail" jsonb not null default '[]',
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "fleet_fuel_records_pkey" primary key ("id")
    );`);
    this.addSql(
      `create index if not exists "fleet_fuel_records_tenant_recorded_index" on "fleet_fuel_records" ("tenant_id", "recorded_at");`,
    );
    this.addSql(
      `create index if not exists "fleet_fuel_records_tenant_vehicle_index" on "fleet_fuel_records" ("tenant_id", "vehicle_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_fuel_records";`);
  }
}
