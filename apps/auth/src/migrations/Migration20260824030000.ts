import { Migration } from "@mikro-orm/migrations";

/**
 * Where a tenant's own mail server credentials live.
 *
 * We are an aggregator for the tenant's mailbox, not the mail host: they supply
 * IMAP for receiving and SMTP for sending, and this service performs the mail
 * operations on their behalf.
 *
 * Passwords are stored as AES-256-GCM ciphertext, never in the clear. The
 * preview columns hold the masked suffix so a screen can show which credential
 * is configured without the value leaving the server.
 */
export class Migration20260824030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "tenant_mail_credentials" (
        "tenant_id" varchar(64) not null primary key,
        "email_address" varchar(255) not null,
        "display_name" varchar(255) null,
        "imap_host" varchar(255) not null,
        "imap_port" int not null,
        "imap_username" varchar(255) not null,
        "imap_password_ciphertext" text not null,
        "imap_password_preview" varchar(32) not null,
        "imap_secure" boolean not null default true,
        "smtp_host" varchar(255) not null,
        "smtp_port" int not null,
        "smtp_username" varchar(255) not null,
        "smtp_password_ciphertext" text not null,
        "smtp_password_preview" varchar(32) not null,
        "smtp_secure" boolean not null default true,
        "last_verified_at" timestamptz null,
        "last_error" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      );
    `);

    // Ciphertext must never reach a log or an export by accident. Postgres has
    // no column-level read control that helps here, so the guarantee lives in
    // the repository, which never selects these columns for a read model.
    this.addSql(
      `create index if not exists "tenant_mail_credentials_email_idx" on "tenant_mail_credentials" ("email_address");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_mail_credentials";`);
  }
}
