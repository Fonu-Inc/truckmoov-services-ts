import { Migration } from '@mikro-orm/migrations';

/**
 * Roles tenants build for themselves, and which of them each user holds.
 * A user with no custom role holds the predefined role named by role_id.
 */
export class Migration20260923010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_roles" (
      "id" varchar(64) not null,
      "tenant_id" varchar(64) not null,
      "name" varchar(80) not null,
      "description" varchar(240) null,
      "permissions" jsonb not null default '[]',
      "created_by" varchar(64) not null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      constraint "tenant_roles_pkey" primary key ("id")
    );`);
    this.addSql(
      `create unique index if not exists "tenant_roles_tenant_name_unique" on "tenant_roles" ("tenant_id", lower("name"));`,
    );
    this.addSql(`alter table "auth_users" add column if not exists "custom_role_id" varchar(64) null;`);
    this.addSql(
      `create index if not exists "auth_users_custom_role_index" on "auth_users" ("custom_role_id") where "custom_role_id" is not null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "auth_users_custom_role_index";`);
    this.addSql(`alter table "auth_users" drop column if exists "custom_role_id";`);
    this.addSql(`drop table if exists "tenant_roles";`);
  }
}
