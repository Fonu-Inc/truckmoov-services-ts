import { Migration } from '@mikro-orm/migrations';

export class Migration20261004010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "tenant_suspensions"
      add column if not exists "cause" varchar(16) not null default 'manual',
      add column if not exists "unpaid_since" date null,
      add column if not exists "grace_days" int null,
      add column if not exists "cascade_status" varchar(16) not null default 'complete',
      add column if not exists "cascade_progress" jsonb not null default '{}',
      add column if not exists "cascade_attempts" int not null default 0,
      add column if not exists "cascade_last_error" text null,
      add column if not exists "cascade_completed_at" timestamptz null,
      add column if not exists "updated_at" timestamptz not null default now();`);

    this.addSql(`alter table "auth_users" add column if not exists "suspension_cause" varchar(16) null;`);
    this.addSql(`update "auth_users" u set "suspension_cause" = 'tenant_manual'
      where u."account_status" = 'disabled' and u."suspension_cause" is null
        and exists (select 1 from "tenant_suspensions" s where s."tenant_id" = u."tenant_id");`);
    this.addSql(`create index if not exists "auth_users_suspension_cause_index"
      on "auth_users" ("tenant_id") where "suspension_cause" is not null;`);

    this.addSql(`alter table "iot_sims"
      add column if not exists "suspension_cause" varchar(16) null,
      add column if not exists "pre_suspension_status" varchar(16) null;`);
    this.addSql(`create index if not exists "iot_sims_suspension_cause_index"
      on "iot_sims" ("tenant_id") where "suspension_cause" is not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "iot_sims_suspension_cause_index";`);
    this.addSql(`alter table "iot_sims" drop column if exists "suspension_cause", drop column if exists "pre_suspension_status";`);
    this.addSql(`drop index if exists "auth_users_suspension_cause_index";`);
    this.addSql(`alter table "auth_users" drop column if exists "suspension_cause";`);
    this.addSql(`alter table "tenant_suspensions"
      drop column if exists "cause", drop column if exists "unpaid_since", drop column if exists "grace_days",
      drop column if exists "cascade_status", drop column if exists "cascade_progress",
      drop column if exists "cascade_attempts", drop column if exists "cascade_last_error",
      drop column if exists "cascade_completed_at", drop column if exists "updated_at";`);
  }
}
