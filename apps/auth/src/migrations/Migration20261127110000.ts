import { Migration } from '@mikro-orm/migrations';

/**
 * Installation evidence belongs to one vehicle. Existing photos keep a null
 * vehicle (they count for every vehicle) except on single-unit jobs, where the
 * only vehicle is unambiguous.
 */
export class Migration20261127110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "installation_evidence" add column if not exists "vehicle_id" varchar(64) null;`);
    this.addSql(`update "installation_evidence" e set "vehicle_id" = a."vehicle_id"
      from "installation_device_assignments" a
      where e."vehicle_id" is null and a."order_id" = e."order_id"
        and (select count(*) from "installation_device_assignments" c where c."order_id" = e."order_id") = 1;`);
    this.addSql(`create index if not exists "installation_evidence_order_id_vehicle_id_index" on "installation_evidence" ("order_id", "vehicle_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "installation_evidence_order_id_vehicle_id_index";`);
    this.addSql(`alter table "installation_evidence" drop column if exists "vehicle_id";`);
  }
}
