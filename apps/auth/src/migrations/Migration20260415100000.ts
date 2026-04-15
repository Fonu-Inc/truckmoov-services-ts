import { Migration } from '@mikro-orm/migrations';

export class Migration20260415100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "support_tickets" ("id" varchar(255) not null, "tenant_id" varchar(64) not null, "category" varchar(32) not null default 'other', "subject" varchar(255) not null, "description" text not null, "status" varchar(32) not null default 'open', "priority" varchar(16) not null default 'medium', "context_type" varchar(16) not null default 'none', "context_id" varchar(64) null, "context_snapshot" jsonb null, "escalated_to" varchar(32) null, "escalated_reference_id" varchar(128) null, "escalation_notes" text null, "escalated_at" timestamptz null, "escalated_by" varchar(64) null, "assigned_to" varchar(64) null, "created_by" varchar(64) not null, "resolved_at" timestamptz null, "closed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "support_tickets_pkey" primary key ("id"));`,
    );
    this.addSql(`create index if not exists "support_tickets_tenant_id_index" on "support_tickets" ("tenant_id");`);
    this.addSql(`create index if not exists "support_tickets_status_index" on "support_tickets" ("status");`);
    this.addSql(`create index if not exists "support_tickets_category_index" on "support_tickets" ("category");`);
    this.addSql(`create index if not exists "support_tickets_created_at_index" on "support_tickets" ("created_at");`);

    this.addSql(
      `create table if not exists "support_messages" ("id" varchar(255) not null, "ticket_id" varchar(64) not null, "sender_id" varchar(64) not null, "sender_name" varchar(160) null, "sender_role" varchar(32) not null, "message" text not null, "is_internal" boolean not null default false, "created_at" timestamptz not null default now(), constraint "support_messages_pkey" primary key ("id"));`,
    );
    this.addSql(`create index if not exists "support_messages_ticket_id_index" on "support_messages" ("ticket_id");`);
    this.addSql(`create index if not exists "support_messages_created_at_index" on "support_messages" ("created_at");`);
  }
}
