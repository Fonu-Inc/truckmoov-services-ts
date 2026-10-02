import { Migration } from '@mikro-orm/migrations';

export class Migration20261006030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_data_exports" (
      "id" varchar(64) not null,
      "tenant_id" varchar(64) not null,
      "scope" varchar(16) not null,
      "status" varchar(16) not null default 'pending',
      "row_counts" jsonb not null default '{}'::jsonb,
      "file_key" varchar(512) null,
      "file_name" varchar(255) null,
      "file_bytes" bigint null,
      "error" text null,
      "requested_by" varchar(64) not null,
      "requested_by_name" varchar(255) null,
      "created_at" timestamptz not null default now(),
      "expires_at" timestamptz not null,
      constraint "tenant_data_exports_pkey" primary key ("id")
    );`);
    this.addSql(
      `create index if not exists "tenant_data_exports_tenant_idx" on "tenant_data_exports" ("tenant_id", "created_at" desc);`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_data_exports";`);
  }
}
