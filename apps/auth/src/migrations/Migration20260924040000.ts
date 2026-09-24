import { Migration } from '@mikro-orm/migrations';

export class Migration20260924040000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "installation_orders" add column if not exists "installer_notes" text null;`);

    this.addSql(`create table if not exists "installation_checklist_ticks" (
      "order_id" varchar(64) not null,
      "item_key" varchar(64) not null,
      "checked_at" timestamptz not null,
      "checked_by" varchar(64) not null,
      constraint "installation_checklist_ticks_pkey" primary key ("order_id", "item_key")
    );`);

    this.addSql(`create table if not exists "installation_evidence" (
      "id" varchar(64) not null,
      "order_id" varchar(64) not null,
      "category" varchar(32) not null,
      "file_key" varchar(512) not null,
      "file_hash" varchar(64) not null,
      "file_size" int not null,
      "mime_type" varchar(32) not null,
      "uploaded_by" varchar(64) not null,
      "created_at" timestamptz not null default now(),
      constraint "installation_evidence_pkey" primary key ("id")
    );`);
    this.addSql(`create index if not exists "installation_evidence_order_id_index" on "installation_evidence" ("order_id");`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "installation_evidence";`);
    this.addSql(`drop table if exists "installation_checklist_ticks";`);
    this.addSql(`alter table "installation_orders" drop column if exists "installer_notes";`);
  }
}
