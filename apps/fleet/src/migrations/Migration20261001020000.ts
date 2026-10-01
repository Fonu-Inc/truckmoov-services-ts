import { Migration } from "@mikro-orm/migrations";

/**
 * Who suspended a device, so a tenant can lift its own suspension but never
 * the platform's. Every device suspended so far was suspended by the platform,
 * the only party that could.
 */
export class Migration20261001020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "fleet_devices" add column if not exists "suspended_by" varchar(16) null;`);
    this.addSql(`update "fleet_devices" set "suspended_by" = 'platform' where "lifecycle_status" = 'suspended' and "suspended_by" is null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fleet_devices" drop column if exists "suspended_by";`);
  }
}
