import { Migration } from "@mikro-orm/migrations";

/**
 * Drops fleet's copy of the bundle catalogue. Auth's catalogue (bundle_carriers,
 * bundle_catalog) is the only one now: it is priced and charges the shared
 * wallet, and fleet reads it from auth. Nothing references these tables by key;
 * device setup requests keep their carrier and bundle as plain strings.
 *
 * The rows held here were the original seed, kept for the record:
 *   carrier-mtn MTN, carrier-airtel Airtel, carrier-glo Glo, carrier-9mobile 9mobile
 *   MTN 1GB Monthly NGN 1000, MTN 2GB Monthly NGN 1800,
 *   Airtel 1GB Monthly NGN 1000, Airtel 2GB Monthly NGN 1800,
 *   Glo 1GB Monthly NGN 900, 9mobile 1GB Monthly NGN 950
 */
export class Migration20261002010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`drop table if exists "fleet_data_bundles";`);
    this.addSql(`drop table if exists "fleet_carriers";`);
  }

  override async down(): Promise<void> {
    // Not restored: a second catalogue is what this removed.
  }
}
