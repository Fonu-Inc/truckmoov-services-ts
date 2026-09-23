import { Migration } from '@mikro-orm/migrations';

/**
 * Permissions the governance team takes away from a tenant, each with the
 * date it takes effect. Kept after it applies or is cancelled: the record is
 * the audit trail of who removed what, when, and why.
 */
export class Migration20260923020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_permission_removals" (
      "id" varchar(64) not null,
      "tenant_id" varchar(64) not null,
      "permission" varchar(96) not null,
      "effective_at" timestamptz not null,
      "reason" varchar(500) not null,
      "status" varchar(16) not null,
      "created_by" varchar(64) not null,
      "created_at" timestamptz not null default now(),
      "cancelled_by" varchar(64) null,
      "cancelled_at" timestamptz null,
      "applied_at" timestamptz null,
      constraint "tenant_permission_removals_pkey" primary key ("id")
    );`);
    this.addSql(
      `create index if not exists "tenant_permission_removals_tenant_index" on "tenant_permission_removals" ("tenant_id", "status");`,
    );
    this.addSql(
      `create index if not exists "tenant_permission_removals_due_index" on "tenant_permission_removals" ("effective_at") where "status" = 'scheduled';`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_permission_removals";`);
  }
}
