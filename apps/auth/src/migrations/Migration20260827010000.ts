import { Migration } from "@mikro-orm/migrations";

/**
 * Ticket attachments, and the extra category values the tenant-facing screen
 * names beyond what the platform-admin side already used.
 *
 * category and status stay the columns support_tickets already has — this
 * only widens the accepted category values in application code, nothing in
 * the schema needs to change for that. Attachments get their own table: a
 * ticket, or a reply on it, can carry several.
 */
export class Migration20260827010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "support_ticket_attachments" (
        "id" varchar(255) not null primary key,
        "ticket_id" varchar(64) not null,
        "tenant_id" varchar(64) not null,
        "message_id" varchar(64) null,
        "key" varchar(512) not null,
        "filename" varchar(255) not null,
        "content_type" varchar(128) not null,
        "size_bytes" bigint not null,
        "uploaded_by" varchar(64) not null,
        "created_at" timestamptz not null default now()
      )
    `);
    this.addSql(`
      create index if not exists "support_ticket_attachments_ticket_index"
        on "support_ticket_attachments" ("ticket_id")
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "support_ticket_attachments"`);
  }
}
