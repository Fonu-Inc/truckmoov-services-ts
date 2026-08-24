import { Migration } from "@mikro-orm/migrations";

/**
 * Re-derives fleet_devices.status from lifecycle_status. The status column is a
 * projection of the lifecycle, but rows written before the projection existed
 * could hold a value the lifecycle no longer supports, so the platform device
 * list and the installation screen disagreed about the same device.
 */
export class Migration20260824000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      update "fleet_devices"
      set "status" = case "lifecycle_status"
        when 'registered' then 'registered'
        when 'config_pending' then 'registered'
        when 'configured' then 'configured'
        when 'verified_online' then 'active'
        when 'assignable' then 'active'
        when 'assigned' then 'assigned'
        when 'faulty' then 'faulty'
        when 'decommissioned' then 'decommissioned'
        else "status"
      end
      where "lifecycle_status" is not null;
    `);
  }

  async down(): Promise<void> {
    // The pre-migration values were inconsistent by definition. Nothing to restore.
  }
}
