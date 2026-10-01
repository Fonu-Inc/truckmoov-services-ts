import { Migration } from "@mikro-orm/migrations";

/** Charges priced at approval, kept so a later price change cannot rewrite them. */
export class Migration20261005010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "fleet_device_setup_requests" add column if not exists "charges" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fleet_device_setup_requests" drop column if exists "charges";`);
  }
}
