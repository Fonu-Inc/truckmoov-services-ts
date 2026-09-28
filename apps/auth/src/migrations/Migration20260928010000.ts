import { Migration } from '@mikro-orm/migrations';

/**
 * An order must carry its own required services so delayed assignment sweeps
 * apply the same capability constraint as immediate assignment.
 */
export class Migration20260928010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "installation_orders"
      add column if not exists "required_capabilities" text[] not null default '{device_installation}';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "installation_orders" drop column if exists "required_capabilities";`);
  }
}
