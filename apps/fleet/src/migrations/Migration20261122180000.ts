import { Migration } from "@mikro-orm/migrations";

/** Licence-expiry reminders: one per driver, mailed once for each expiry date. */
export class Migration20261122180000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "driver_licence_reminders" (
      "tenant_id" varchar(64) not null,
      "driver_id" varchar(255) not null,
      "recipient_email" varchar(254) not null,
      "lead_days" integer not null,
      "sent_for_expiry" varchar(32) null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      primary key ("tenant_id", "driver_id")
    );`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "driver_licence_reminders";`);
  }
}
