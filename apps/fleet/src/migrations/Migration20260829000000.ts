import { Migration } from "@mikro-orm/migrations";

/**
 * Links a vehicle to the owner-operator identity it belongs to, so compliance
 * documents can be scoped to the vehicles an owner-operator actually owns
 * instead of trusting a caller-supplied vehicleId filter.
 */
export class Migration20260829000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "fleet_vehicles"
        add column if not exists "owner_operator_id" varchar(64) null
    `);
    this.addSql(`
      create index if not exists "fleet_vehicles_owner_operator_id_index"
        on "fleet_vehicles" ("owner_operator_id")
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "fleet_vehicles"
        drop column if exists "owner_operator_id"
    `);
  }
}
