import { Migration } from "@mikro-orm/migrations";

/**
 * A non-destructive hold on a tenant's assets. Devices keep their vehicle,
 * vehicles keep their status and driver, share links keep their revoked state:
 * the hold is a separate flag, set and cleared by the tenant suspension.
 */
export class Migration20261004010000 extends Migration {
  override async up(): Promise<void> {
    for (const table of ["fleet_devices", "fleet_vehicles", "fleet_tracking_share_links"]) {
      this.addSql(`alter table "${table}"
        add column if not exists "hold_cause" varchar(16) null,
        add column if not exists "held_at" timestamptz null,
        add column if not exists "hold_reason" text null;`);
      this.addSql(
        `create index if not exists "${table}_hold_index" on "${table}" ("tenant_id") where "hold_cause" is not null;`,
      );
    }
    this.addSql(
      `create index if not exists "fleet_tracking_share_links_tenant_index" on "fleet_tracking_share_links" ("tenant_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "fleet_tracking_share_links_tenant_index";`);
    for (const table of ["fleet_devices", "fleet_vehicles", "fleet_tracking_share_links"]) {
      this.addSql(`drop index if exists "${table}_hold_index";`);
      this.addSql(`alter table "${table}"
        drop column if exists "hold_cause", drop column if exists "held_at", drop column if exists "hold_reason";`);
    }
  }
}
