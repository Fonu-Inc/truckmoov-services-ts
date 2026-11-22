import { Migration } from "@mikro-orm/migrations";

/** Per-tenant maintenance dispatch rules (Settings → Fleet). No row means the defaults. */
export class Migration20261123140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fleet_maintenance_settings" (
      "tenant_id" varchar(64) primary key,
      "dispatch_overdue_action" varchar(8) not null default 'warn' check ("dispatch_overdue_action" in ('allow', 'warn', 'block')),
      "dispatch_due_action" varchar(8) not null default 'allow' check ("dispatch_due_action" in ('allow', 'warn', 'block')),
      "warn_days_before" integer not null default 7 check ("warn_days_before" between 1 and 30),
      "updated_by" varchar(64) null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now()
    );`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_maintenance_settings";`);
  }
}
