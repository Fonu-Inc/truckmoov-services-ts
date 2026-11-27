import { Migration } from '@mikro-orm/migrations';

/** Device-to-SIM lookups filtered on device_id were sequential scans. */
export class Migration20261127120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create index if not exists "iot_sims_device_id_index" on "iot_sims" ("device_id") where "device_id" is not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "iot_sims_device_id_index";`);
  }
}
