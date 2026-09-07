import { Migration } from '@mikro-orm/migrations';

/**
 * Platform security posture: two-factor enforcement, idle session timeout and
 * the audit-logging switch. Nullable so rows written before it existed read as
 * the safe defaults rather than as two-factor enforced.
 */
export class Migration20260907030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "system_settings" add column if not exists "security" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "system_settings" drop column if exists "security";`);
  }
}
