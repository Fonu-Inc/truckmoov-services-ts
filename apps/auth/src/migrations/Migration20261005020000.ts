import { Migration } from '@mikro-orm/migrations';

/**
 * Removes the "testing+manu" catalogue row, a test entry that made it the only
 * supported manufacturer the Add Device modal offered. Matched exactly so no
 * real manufacturer is touched. No down: it was never real data.
 */
export class Migration20261005020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `delete from "system_device_models" where "manufacturer" = 'testing+manu';`,
    );
  }
}
