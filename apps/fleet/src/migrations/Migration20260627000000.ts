import { Migration } from "@mikro-orm/migrations";

export class Migration20260627000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "fleet_vehicles"
      add column if not exists "fuel_type" varchar(16) null;
    `);
    this.addSql(`
      create table if not exists "fleet_fuel_budgets" (
        "id" varchar(255) not null,
        "tenant_id" varchar(64) not null,
        "vehicle_id" varchar(255) not null default '',
        "period_type" varchar(16) not null default 'monthly',
        "amount_ngn" numeric(14,2) not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "fleet_fuel_budgets_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      create unique index if not exists "fleet_fuel_budgets_tenant_id_vehicle_id_unique"
      on "fleet_fuel_budgets" ("tenant_id", "vehicle_id");
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_fuel_budgets";`);
    this.addSql(`alter table "fleet_vehicles" drop column if exists "fuel_type";`);
  }
}
