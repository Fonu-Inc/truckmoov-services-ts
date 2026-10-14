import { Migration } from "@mikro-orm/migrations";

/**
 * Road speeding state per vehicle. An alert needs two breaches close together,
 * so one GPS speed spike or one snap onto the wrong road raises nothing, and
 * then waits out a cooldown, so a truck flicking between road names during
 * matching is not alerted on every fix. One row lock orders both replicas.
 */
export class Migration20261013140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fleet_road_speeding_state" (
      "tenant_id" varchar(64) not null,
      "vehicle_id" varchar(64) not null,
      "last_breach_at" timestamptz not null,
      "alerted_at" timestamptz null,
      constraint "fleet_road_speeding_state_pkey" primary key ("tenant_id", "vehicle_id")
    );`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_road_speeding_state";`);
  }
}
