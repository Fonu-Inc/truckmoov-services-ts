import { Migration } from "@mikro-orm/migrations";

/**
 * What is needed to fetch an attachment later, and to say whether a sent
 * message actually arrived.
 *
 * uid: attachment bytes are left on the mail server until something asks for
 * them, so the message has to remember where it lives to fetch them.
 *
 * delivery_status: SMTP gives no delivery receipt. A message is only ever known
 * to have failed, and that is learned from a bounce arriving later in the inbox.
 */
export class Migration20260824050000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "tenant_mail_messages" add column if not exists "uid" bigint not null default 0;`);
    this.addSql(
      `alter table "tenant_mail_messages" add column if not exists "delivery_status" varchar(16) not null default 'unknown';`,
    );
    this.addSql(`alter table "tenant_mail_messages" add column if not exists "delivery_detail" text null;`);

    // Bounces are matched back by the Message-ID they quote, so that lookup has
    // to be cheap: it runs for every inbound message that looks like a report.
    this.addSql(
      `create index if not exists "tenant_mail_messages_delivery_idx" on "tenant_mail_messages" ("tenant_id", "delivery_status");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "tenant_mail_messages" drop column if exists "delivery_detail";`);
    this.addSql(`alter table "tenant_mail_messages" drop column if exists "delivery_status";`);
    this.addSql(`alter table "tenant_mail_messages" drop column if exists "uid";`);
  }
}
