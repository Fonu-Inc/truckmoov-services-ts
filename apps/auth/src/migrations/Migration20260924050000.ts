import { Migration } from '@mikro-orm/migrations';

/**
 * Installer tickets live in support_tickets under tenant 'system', so tenant
 * queries (tenant_id equality) never see them. Every ticket gets a number from
 * 1000 for the #tkt-N display id, existing ones oldest first.
 */
export class Migration20260924050000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create sequence if not exists "support_ticket_number_seq" start with 1000;`);
    this.addSql(`alter table "support_tickets"
      add column if not exists "reporter_type" varchar(16) not null default 'tenant_user',
      add column if not exists "reporter_id" varchar(64) null,
      add column if not exists "related_tenant_id" varchar(64) null,
      add column if not exists "related_order_id" varchar(64) null,
      add column if not exists "issue_code" varchar(64) null,
      add column if not exists "callback_phone" varchar(20) null,
      add column if not exists "ticket_number" bigint null;`);

    this.addSql(`update "support_tickets" t set "ticket_number" = numbered.n
      from (select "id", 999 + row_number() over (order by "created_at", "id") as n from "support_tickets") numbered
      where t."id" = numbered."id" and t."ticket_number" is null;`);
    this.addSql(`select setval('support_ticket_number_seq', coalesce((select max("ticket_number") from "support_tickets"), 999));`);
    this.addSql(`alter table "support_tickets"
      alter column "ticket_number" set default nextval('support_ticket_number_seq'),
      alter column "ticket_number" set not null;`);
    this.addSql(`create unique index if not exists "support_tickets_ticket_number_unique" on "support_tickets" ("ticket_number");`);
    this.addSql(`create index if not exists "support_tickets_reporter_index" on "support_tickets" ("reporter_type", "reporter_id");`);
    this.addSql(`create index if not exists "support_tickets_related_order_id_index" on "support_tickets" ("related_order_id");`);

    this.addSql(`alter table "installation_orders" add column if not exists "issue_reported_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "installation_orders" drop column if exists "issue_reported_at";`);
    this.addSql(`drop index if exists "support_tickets_related_order_id_index";`);
    this.addSql(`drop index if exists "support_tickets_reporter_index";`);
    this.addSql(`drop index if exists "support_tickets_ticket_number_unique";`);
    this.addSql(`alter table "support_tickets"
      drop column if exists "ticket_number",
      drop column if exists "callback_phone",
      drop column if exists "issue_code",
      drop column if exists "related_order_id",
      drop column if exists "related_tenant_id",
      drop column if exists "reporter_id",
      drop column if exists "reporter_type";`);
    this.addSql(`drop sequence if exists "support_ticket_number_seq";`);
  }
}
