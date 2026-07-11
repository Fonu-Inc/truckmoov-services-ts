import { Migration } from "@mikro-orm/migrations";

export class Migration20260711000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "fleet_financial_configs"
        add column if not exists "monthly_parking_ngn" numeric(14,2) null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "fleet_financial_configs"
        drop column if exists "monthly_parking_ngn";
    `);
  }
}
