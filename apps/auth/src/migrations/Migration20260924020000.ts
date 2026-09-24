import { Migration } from '@mikro-orm/migrations';

/**
 * Installation jobs get the installer portal's status set: the old
 * `scheduled` (nobody assigned yet) becomes `unassigned` and
 * `installer_assigned` becomes `assigned`. Each step gets its timestamp, new
 * job numbers come from a sequence as FL-NNNN, and each unit can be bound to
 * the fleet device fitted there. Existing FP-INST- numbers are kept.
 */
export class Migration20260924020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create sequence if not exists "installation_order_number_seq" start with 1000;`);
    this.addSql(`alter table "installation_orders"
      add column if not exists "pre_exception_status" varchar(24) null,
      add column if not exists "assigned_at" timestamptz null,
      add column if not exists "accepted_at" timestamptz null,
      add column if not exists "started_at" timestamptz null,
      add column if not exists "cancelled_at" timestamptz null;`);

    this.addSql(`update "installation_orders" set "status" = case "status"
        when 'scheduled' then 'unassigned'
        when 'installer_assigned' then 'assigned'
        else "status" end
      where "status" in ('scheduled', 'installer_assigned');`);
    this.addSql(`update "installation_orders" set "assigned_at" = "created_at"
      where "installer_id" is not null and "assigned_at" is null;`);
    this.addSql(`alter table "installation_orders" alter column "status" set default 'unassigned';`);

    this.addSql(`create index if not exists "installation_orders_installer_id_status_index"
      on "installation_orders" ("installer_id", "status");`);
    this.addSql(`create index if not exists "installation_orders_installer_id_scheduled_date_index"
      on "installation_orders" ("installer_id", "scheduled_date");`);

    this.addSql(`alter table "installation_device_assignments"
      add column if not exists "fleet_device_id" varchar(64) null;`);
    this.addSql(`create unique index if not exists "installation_device_assignments_fleet_device_id_unique"
      on "installation_device_assignments" ("fleet_device_id") where "fleet_device_id" is not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "installation_device_assignments_fleet_device_id_unique";`);
    this.addSql(`alter table "installation_device_assignments" drop column if exists "fleet_device_id";`);
    this.addSql(`drop index if exists "installation_orders_installer_id_scheduled_date_index";`);
    this.addSql(`drop index if exists "installation_orders_installer_id_status_index";`);

    this.addSql(`update "installation_orders" set "status" = case
        when "status" in ('completed', 'cancelled') then "status"
        when "installer_id" is null then 'scheduled'
        else 'installer_assigned' end;`);
    this.addSql(`alter table "installation_orders" alter column "status" set default 'scheduled';`);
    this.addSql(`alter table "installation_orders"
      drop column if exists "cancelled_at",
      drop column if exists "started_at",
      drop column if exists "accepted_at",
      drop column if exists "assigned_at",
      drop column if exists "pre_exception_status";`);
    this.addSql(`drop sequence if exists "installation_order_number_seq";`);
  }
}
