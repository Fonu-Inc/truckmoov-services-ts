import { Migration } from '@mikro-orm/migrations';

export class Migration20260905020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fleet_maintenance_reminder_schedules" ("id" varchar(64) not null, "tenant_id" varchar(64) not null, "recipient_email" varchar(254) not null, "lead_days" int not null default 30, "enabled" boolean not null default true, "last_run_at" timestamptz null, "last_sent_count" int null, "created_by" varchar(64) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "fleet_maintenance_reminder_schedules_pkey" primary key ("id"));`);
    this.addSql(`create unique index if not exists "fleet_maintenance_reminder_schedules_tenant_unique" on "fleet_maintenance_reminder_schedules" ("tenant_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_maintenance_reminder_schedules";`);
  }
}
