import { Migration } from "@mikro-orm/migrations";

/** One satisfaction rating per support ticket, given once it is resolved or closed. */
export class Migration20261123120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "support_ticket_csat" (
      "id" varchar(64) primary key,
      "ticket_id" varchar(64) not null,
      "tenant_id" varchar(64) not null,
      "user_id" varchar(64) not null,
      "rating" smallint not null check ("rating" between 1 and 5),
      "comment" text null,
      "would_recommend" boolean null,
      "created_at" timestamptz not null default now()
    );`);
    this.addSql(`create unique index if not exists "support_ticket_csat_ticket_id_unique" on "support_ticket_csat" ("ticket_id");`);
    this.addSql(`create index if not exists "support_ticket_csat_tenant_id_index" on "support_ticket_csat" ("tenant_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "support_ticket_csat";`);
  }
}
