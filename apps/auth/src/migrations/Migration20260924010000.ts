import { Migration } from '@mikro-orm/migrations';

/**
 * Installers become accounts: each gets a code, its own sign-in once the
 * invite is accepted, the states it serves and what it can do. A status
 * replaces is_active, because an invited installer is neither.
 */
export class Migration20260924010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create sequence if not exists "installer_code_seq";`);
    this.addSql(`alter table "installers"
      add column if not exists "user_id" varchar(64) null,
      add column if not exists "code" varchar(16) null,
      add column if not exists "first_name" varchar(60) null,
      add column if not exists "last_name" varchar(60) null,
      add column if not exists "city" varchar(80) null,
      add column if not exists "service_areas" text[] not null default '{}',
      add column if not exists "capabilities" text[] not null default '{}',
      add column if not exists "photo_key" varchar(512) null,
      add column if not exists "notification_preferences" jsonb null,
      add column if not exists "status" varchar(16) null,
      add column if not exists "max_active_jobs" int not null default 3,
      add column if not exists "last_activity_at" timestamptz null;`);

    this.addSql(`with ordered as (
        select "id", row_number() over (order by "created_at", "id") as n from "installers"
      )
      update "installers" i set "code" = 'INS-' || lpad(o.n::text, 4, '0')
      from ordered o where i."id" = o."id" and i."code" is null;`);
    this.addSql(
      `select setval('installer_code_seq', greatest((select count(*) from "installers"), 1), (select count(*) from "installers") > 0);`,
    );
    this.addSql(`update "installers" set
      "first_name" = split_part("full_name", ' ', 1),
      "last_name" = trim(substr("full_name", length(split_part("full_name", ' ', 1)) + 1))
      where "first_name" is null;`);
    this.addSql(`update "installers" set "service_areas" = array["state"] where "service_areas" = '{}' and "state" is not null;`);
    this.addSql(`update "installers" set "status" = case when "is_active" then 'active' else 'suspended' end where "status" is null;`);

    this.addSql(`alter table "installers"
      alter column "code" set not null,
      alter column "first_name" set not null,
      alter column "last_name" set not null,
      alter column "status" set not null,
      alter column "status" set default 'invited',
      alter column "state" drop not null,
      alter column "team" set default '',
      drop column if exists "is_active";`);
    this.addSql(`create unique index if not exists "installers_code_unique" on "installers" ("code");`);
    this.addSql(`create unique index if not exists "installers_user_id_unique" on "installers" ("user_id");`);
    this.addSql(`create index if not exists "installers_status_index" on "installers" ("status");`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "installers" add column if not exists "is_active" boolean not null default true;`);
    this.addSql(`update "installers" set "is_active" = ("status" = 'active');`);
    this.addSql(`update "installers" set "state" = coalesce("state", "service_areas"[1], '') where "state" is null;`);
    this.addSql(`drop index if exists "installers_status_index";`);
    this.addSql(`drop index if exists "installers_user_id_unique";`);
    this.addSql(`drop index if exists "installers_code_unique";`);
    this.addSql(`alter table "installers"
      alter column "state" set not null,
      alter column "team" drop default,
      drop column if exists "last_activity_at",
      drop column if exists "max_active_jobs",
      drop column if exists "status",
      drop column if exists "notification_preferences",
      drop column if exists "photo_key",
      drop column if exists "capabilities",
      drop column if exists "service_areas",
      drop column if exists "city",
      drop column if exists "last_name",
      drop column if exists "first_name",
      drop column if exists "code",
      drop column if exists "user_id";`);
    this.addSql(`drop sequence if exists "installer_code_seq";`);
  }
}
