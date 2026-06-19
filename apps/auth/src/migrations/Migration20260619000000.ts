import { Migration } from '@mikro-orm/migrations';

export class Migration20260619000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create extension if not exists pg_trgm;`);

    this.addSql(`
      create index if not exists "auth_users_email_trgm_idx"
      on "auth_users" using gin (email gin_trgm_ops);
    `);

    this.addSql(`
      create index if not exists "auth_users_fullname_trgm_idx"
      on "auth_users" using gin ((profile->>'fullName') gin_trgm_ops)
      where profile is not null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "auth_users_email_trgm_idx";`);
    this.addSql(`drop index if exists "auth_users_fullname_trgm_idx";`);
  }
}
