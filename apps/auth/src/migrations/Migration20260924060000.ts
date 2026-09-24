import { Migration } from '@mikro-orm/migrations';

export class Migration20260924060000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "installer_notifications" (
      "id" varchar(64) not null,
      "installer_id" varchar(64) not null,
      "type" varchar(40) not null,
      "title" varchar(120) not null,
      "body" text not null,
      "order_id" varchar(64) null,
      "dedupe_key" varchar(200) not null,
      "created_at" timestamptz not null default now(),
      "read_at" timestamptz null,
      constraint "installer_notifications_pkey" primary key ("id")
    );`);
    this.addSql(`create unique index if not exists "installer_notifications_dedupe_key_unique" on "installer_notifications" ("dedupe_key");`);
    this.addSql(`create index if not exists "installer_notifications_inbox_index" on "installer_notifications" ("installer_id", "created_at" desc);`);
    this.addSql(`create index if not exists "installer_notifications_unread_index" on "installer_notifications" ("installer_id") where "read_at" is null;`);

    this.addSql(`alter table "installation_orders" add column if not exists "reminder_sent_at" timestamptz null;`);

    this.addSql(`insert into "platform_alert_settings" ("alert_type", "enabled", "channels", "recipients", "min_severity")
      values ('installation_issues', true, '["email"]'::jsonb, '[]'::jsonb, 'high')
      on conflict ("alert_type") do nothing;`);
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "platform_alert_settings" where "alert_type" = 'installation_issues';`);
    this.addSql(`alter table "installation_orders" drop column if exists "reminder_sent_at";`);
    this.addSql(`drop table if exists "installer_notifications";`);
  }
}
