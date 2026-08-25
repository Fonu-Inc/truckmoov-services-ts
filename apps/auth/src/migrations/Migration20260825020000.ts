import { Migration } from "@mikro-orm/migrations";

/**
 * How many bytes each tenant holds in object storage.
 *
 * Kept as a running total rather than summed on demand. Summing every document
 * row on each upload is a table scan on the hot path, and it gets slower as the
 * tenant grows — which is exactly the tenant most likely to be near the limit.
 *
 * Split by source because more than one service stores files: fleet holds
 * documents, auth holds KYC files, media uploads and mailbox attachments. Each
 * service owns its own row and can recompute it from its own tables, which is
 * what makes the total self-correcting. A single shared counter could only ever
 * drift, because no one service could recompute it.
 */
export class Migration20260825020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "tenant_storage_usage" (
        "tenant_id" varchar(64) not null,
        "source" varchar(32) not null,
        "bytes_used" bigint not null default 0,
        "reconciled_at" timestamptz null,
        "updated_at" timestamptz not null default now(),
        constraint "tenant_storage_usage_pkey" primary key ("tenant_id", "source")
      );
    `);
    this.addSql(
      `create index if not exists "tenant_storage_usage_tenant_idx" on "tenant_storage_usage" ("tenant_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_storage_usage";`);
  }
}
