import { Migration } from "@mikro-orm/migrations";

/**
 * Star and label state for mail messages, mirrored from IMAP's \Flagged flag
 * and custom keyword flags respectively. Read-through columns: written by a
 * sync after the platform has already changed them upstream via IMAP STORE,
 * never the other way around.
 */
export class Migration20260827030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "tenant_mail_messages"
        add column if not exists "starred" boolean not null default false,
        add column if not exists "labels" jsonb not null default '[]';
    `);
  }
}
