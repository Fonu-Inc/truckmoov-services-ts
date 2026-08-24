import { Migration } from "@mikro-orm/migrations";

/**
 * Adds tenant_business_info.verified_at. The system tenant list has selected
 * this column since the table was introduced, so every request that reached
 * that read failed with "column verified_at does not exist" once a deployment
 * actually had the table. It stays null until the KYC rollup stamps it.
 */
export class Migration20260824000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `alter table "tenant_business_info" add column if not exists "verified_at" timestamptz null;`,
    );
  }

  async down(): Promise<void> {
    this.addSql(`alter table "tenant_business_info" drop column if exists "verified_at";`);
  }
}
