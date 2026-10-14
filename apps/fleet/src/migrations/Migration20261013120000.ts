import { Migration } from "@mikro-orm/migrations";

/**
 * Zone speed limits were configurable but never enforced. A speeding alert
 * fires once per stay, so the stay records when it was raised, as dwell does.
 */
export class Migration20261013120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "fleet_zone_occupancy" add column if not exists "speeding_notified_at" timestamptz null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fleet_zone_occupancy" drop column if exists "speeding_notified_at";`);
  }
}
