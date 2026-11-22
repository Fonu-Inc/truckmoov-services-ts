import { Migration } from "@mikro-orm/migrations";

/** Platform alerts routed to the admin portal's in-app channel, and who has read them. */
export class Migration20261122130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "admin_notifications" (
      "id" varchar(64) primary key,
      "event_id" varchar(64) not null,
      "alert_type" varchar(40) not null,
      "severity" varchar(16) not null,
      "title" varchar(200) not null,
      "body" text not null default '',
      "created_at" timestamptz not null default now()
    );`);
    this.addSql(`create unique index if not exists "admin_notifications_event_id_unique" on "admin_notifications" ("event_id");`);
    this.addSql(`create index if not exists "admin_notifications_created_at_index" on "admin_notifications" ("created_at" desc);`);
    this.addSql(`create table if not exists "admin_notification_reads" (
      "notification_id" varchar(64) not null references "admin_notifications" ("id") on delete cascade,
      "user_id" varchar(64) not null,
      "read_at" timestamptz not null default now(),
      primary key ("notification_id", "user_id")
    );`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "admin_notification_reads";`);
    this.addSql(`drop table if exists "admin_notifications";`);
  }
}
