import { Migration } from "@mikro-orm/migrations";

export class Migration20260701000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "fleet_financial_configs"
        add column if not exists "fuel_estimate_ngn_per_month" numeric(14,2) null,
        add column if not exists "maintenance_estimate_ngn_per_month" numeric(14,2) null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "fleet_financial_configs"
        drop column if exists "fuel_estimate_ngn_per_month",
        drop column if exists "maintenance_estimate_ngn_per_month";
    `);
  }
}
