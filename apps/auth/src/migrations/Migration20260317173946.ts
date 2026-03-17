import { Migration } from '@mikro-orm/migrations';

export class Migration20260317173946 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "auth_roles" ("id" serial primary key, "name" varchar(64) not null);`);
    this.addSql(`alter table "auth_roles" add constraint if not exists "auth_roles_name_unique" unique ("name");`);

    this.addSql(`create table if not exists "auth_sessions" ("refresh_token" varchar(255) not null, "user_id" varchar(64) not null, "email" varchar(128) not null, "role_id" int not null, "tenant_id" varchar(64) not null default 'default', "updated_at" timestamptz not null default now(), constraint "auth_sessions_pkey" primary key ("refresh_token"));`);

    this.addSql(`create table if not exists "auth_users" ("id" varchar(255) not null, "email" varchar(128) not null, "password_hash" varchar(255) not null, "role_id" int not null, "tenant_id" varchar(64) not null default 'default', "email_verification_token" varchar(128) null, "profile" jsonb null, "notification_preferences" jsonb null, "dispatcher_preferences" jsonb null, "created_at" timestamptz not null default now(), constraint "auth_users_pkey" primary key ("id"));`);
    this.addSql(`alter table "auth_users" add constraint if not exists "auth_users_email_unique" unique ("email");`);

    this.addSql(`create table if not exists "auth_invites" ("id" varchar(255) not null, "email" varchar(255) not null, "role_id" int not null, "tenant_id" varchar(64) not null, "token" varchar(255) not null, "invited_by" varchar(64) not null, "status" varchar(20) not null default 'pending', "expires_at" timestamptz not null, "created_at" timestamptz not null default now(), constraint "auth_invites_pkey" primary key ("id"));`);
    this.addSql(`alter table "auth_invites" add constraint if not exists "auth_invites_token_unique" unique ("token");`);

    this.addSql(`create table if not exists "auth_organization_settings" ("tenant_id" varchar(255) not null, "branding" jsonb not null, "defaults" jsonb not null, "updated_at" timestamptz not null default now(), constraint "auth_organization_settings_pkey" primary key ("tenant_id"));`);

    this.addSql(`create table if not exists "auth_password_resets" ("id" varchar(255) not null, "user_id" varchar(64) not null, "token" varchar(255) not null, "method" varchar(10) not null, "code" varchar(10) null, "used" boolean not null default false, "expires_at" timestamptz not null, "created_at" timestamptz not null default now(), constraint "auth_password_resets_pkey" primary key ("id"));`);
    this.addSql(`alter table "auth_password_resets" add constraint if not exists "auth_password_resets_token_unique" unique ("token");`);
  }

}
