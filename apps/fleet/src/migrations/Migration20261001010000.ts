import { Migration } from "@mikro-orm/migrations";

const TABLES = ["fleet_maintenance_records", "fleet_maintenance_profiles"] as const;

/**
 * Maintenance used to store whatever vehicleId it was sent, and the UI sent the
 * plate, so older rows hold a plate number and join back to no vehicle. Each
 * one whose plate names a vehicle in its tenant now holds that vehicle's id,
 * matched the way plate lookups match (trimmed, upper case). Rows already
 * holding an id, or a plate that names nothing, are left as they are.
 */
export class Migration20261001010000 extends Migration {
  override async up(): Promise<void> {
    for (const table of TABLES) {
      this.addSql(
        `update "${table}" as r
            set "vehicle_id" = v."id"
           from "fleet_vehicles" as v
          where v."tenant_id" = r."tenant_id"
            and v."plate_number" = upper(trim(r."vehicle_id"))
            and not exists (
              select 1 from "fleet_vehicles" as known
               where known."id" = r."vehicle_id" and known."tenant_id" = r."tenant_id"
            );`,
      );
    }
  }

  override async down(): Promise<void> {
    // Nothing to undo: the plate is still on the vehicle the row now names.
  }
}
