import { Migration } from "@mikro-orm/migrations";

export class Migration20260821000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "fleet_documents" (
        "id" varchar(255) not null primary key,
        "tenant_id" varchar(64) not null,
        "entity_type" varchar(32) not null,
        "entity_id" varchar(255) not null,
        "doc_type" varchar(32) not null,
        "key" varchar(1024) not null,
        "filename" varchar(255) not null,
        "content_type" varchar(255) not null,
        "size_bytes" int not null default 0,
        "uploaded_by" varchar(64) not null,
        "uploaded_at" timestamptz not null default now(),
        "expires_at" timestamptz null
      );
    `);
    this.addSql(
      `create index if not exists "fleet_documents_tenant_idx" on "fleet_documents" ("tenant_id");`,
    );
    this.addSql(
      `create index if not exists "fleet_documents_entity_idx" on "fleet_documents" ("tenant_id", "entity_type", "entity_id");`,
    );

    this.addSql(`
      create table if not exists "fleet_document_access_logs" (
        "id" varchar(255) not null primary key,
        "doc_id" varchar(255) not null,
        "tenant_id" varchar(64) not null,
        "action" varchar(32) not null,
        "user_id" varchar(64) not null,
        "ip" varchar(64) not null,
        "at" timestamptz not null default now()
      );
    `);
    this.addSql(
      `create index if not exists "fleet_document_access_logs_doc_idx" on "fleet_document_access_logs" ("doc_id", "tenant_id");`,
    );

    // The access log is an audit surface: append-only, never rewritten.
    this.addSql(
      `revoke update, delete on "fleet_document_access_logs" from public;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_document_access_logs";`);
    this.addSql(`drop table if exists "fleet_documents";`);
  }
}
