import { Migration } from "@mikro-orm/migrations";

/**
 * The aggregated mailbox: threads, messages and where each sync left off.
 *
 * Bodies are stored so a thread can be read without a round trip to the
 * tenant's mail server on every view. Attachment bytes are not: only their
 * metadata is kept, and the bytes are fetched when something asks for them.
 */
export class Migration20260824040000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "tenant_mail_threads" (
        "id" varchar(255) not null,
        "tenant_id" varchar(64) not null,
        "subject" varchar(998) not null,
        "participants" jsonb not null default '[]'::jsonb,
        "message_count" int not null default 0,
        "last_message_at" timestamptz not null,
        "has_unread" boolean not null default false,
        "updated_at" timestamptz not null default now(),
        constraint "tenant_mail_threads_pkey" primary key ("tenant_id", "id")
      );
    `);
    this.addSql(
      `create index if not exists "tenant_mail_threads_recent_idx" on "tenant_mail_threads" ("tenant_id", "last_message_at" desc);`,
    );

    this.addSql(`
      create table if not exists "tenant_mail_messages" (
        "id" varchar(255) not null primary key,
        "tenant_id" varchar(64) not null,
        "thread_id" varchar(255) not null,
        "message_id" varchar(998) not null,
        "in_reply_to" varchar(998) null,
        "references" jsonb not null default '[]'::jsonb,
        "folder" varchar(255) not null,
        "subject" varchar(998) not null,
        "from_address" jsonb not null,
        "to_addresses" jsonb not null default '[]'::jsonb,
        "cc_addresses" jsonb not null default '[]'::jsonb,
        "bcc_addresses" jsonb not null default '[]'::jsonb,
        "body_text" text null,
        "body_html" text null,
        "attachments" jsonb not null default '[]'::jsonb,
        "sent_at" timestamptz not null,
        "received_at" timestamptz not null default now(),
        "seen" boolean not null default false
      );
    `);
    // One row per message per tenant. A re-sync that re-reads the same message
    // must update it rather than store it twice.
    this.addSql(
      `create unique index if not exists "tenant_mail_messages_unique" on "tenant_mail_messages" ("tenant_id", "message_id");`,
    );
    this.addSql(
      `create index if not exists "tenant_mail_messages_thread_idx" on "tenant_mail_messages" ("tenant_id", "thread_id", "sent_at");`,
    );

    this.addSql(`
      create table if not exists "tenant_mail_sync_state" (
        "tenant_id" varchar(64) not null,
        "folder" varchar(255) not null,
        "last_uid" bigint not null default 0,
        "last_synced_at" timestamptz null,
        "last_error" text null,
        constraint "tenant_mail_sync_state_pkey" primary key ("tenant_id", "folder")
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_mail_messages";`);
    this.addSql(`drop table if exists "tenant_mail_threads";`);
    this.addSql(`drop table if exists "tenant_mail_sync_state";`);
  }
}
