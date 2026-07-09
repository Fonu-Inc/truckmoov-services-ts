import { Migration } from "@mikro-orm/migrations";

export class Migration20260709000001 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "fleet_financial_configs"
        add column if not exists "driver_wage_allocation_method" varchar(32) null,
        add column if not exists "monthly_driver_wage_ngn" numeric(14,2) null,
        add column if not exists "asset_purchase_price_ngn" numeric(14,2) null,
        add column if not exists "asset_purchase_date" varchar(10) null,
        add column if not exists "asset_useful_life_months" int null,
        add column if not exists "asset_salvage_value_ngn" numeric(14,2) null,
        add column if not exists "depreciation_method" varchar(32) null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "fleet_financial_configs"
        drop column if exists "driver_wage_allocation_method",
        drop column if exists "monthly_driver_wage_ngn",
        drop column if exists "asset_purchase_price_ngn",
        drop column if exists "asset_purchase_date",
        drop column if exists "asset_useful_life_months",
        drop column if exists "asset_salvage_value_ngn",
        drop column if exists "depreciation_method";
    `);
  }
}
