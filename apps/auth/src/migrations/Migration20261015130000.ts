import { Migration } from '@mikro-orm/migrations';

export class Migration20261015130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create index if not exists "auth_users_email_lower_idx" on "auth_users" (lower("email"));`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "auth_users_email_lower_idx";`);
  }
}
