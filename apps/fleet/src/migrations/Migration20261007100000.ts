import { Migration } from "@mikro-orm/migrations";

const INDEXES: Array<[string, string, string]> = [
  ["fleet_compliance_documents_vehicle_idx", "fleet_compliance_documents", '"tenant_id", "vehicle_id"'],
  ["fleet_alerts_tenant_vehicle_idx", "fleet_alerts", '"tenant_id", "vehicle_id"'],
];

export class Migration20261007100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "fleet_fuel_thresholds" (
        "id" varchar(255) not null,
        "tenant_id" varchar(64) not null,
        "vehicle_type" varchar(64) not null,
        "min_km_per_liter" numeric(8,2) not null,
        "updated_at" timestamptz not null default now(),
        constraint "fleet_fuel_thresholds_pkey" primary key ("id")
      );
    `);
    this.addSql(`
      create unique index if not exists "fleet_fuel_thresholds_tenant_id_vehicle_type_unique"
      on "fleet_fuel_thresholds" ("tenant_id", "vehicle_type");
    `);
    for (const [name, table, columns] of INDEXES) {
      this.addSql(`create index if not exists "${name}" on "${table}" (${columns});`);
    }
  }

  override async down(): Promise<void> {
    for (const [name] of INDEXES) this.addSql(`drop index if exists "${name}";`);
    this.addSql(`drop table if exists "fleet_fuel_thresholds";`);
  }
}
