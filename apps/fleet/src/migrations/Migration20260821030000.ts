import { Migration } from "@mikro-orm/migrations";

export class Migration20260821030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "fleet_audit_logs" (
        "id" varchar(255) not null primary key,
        "tenant_id" varchar(64) not null,
        "entity_type" varchar(64) not null,
        "entity_id" varchar(255) not null,
        "action" varchar(128) not null,
        "actor_id" varchar(64) not null,
        "metadata" jsonb not null default '{}'::jsonb,
        "occurred_at" timestamptz not null default now()
      );
    `);
    this.addSql(
      `create index if not exists "fleet_audit_logs_tenant_idx" on "fleet_audit_logs" ("tenant_id", "occurred_at");`,
    );
    this.addSql(
      `create index if not exists "fleet_audit_logs_entity_idx" on "fleet_audit_logs" ("tenant_id", "entity_type", "entity_id");`,
    );

    // An audit trail that can be edited is not an audit trail. The console
    // service protects its own log the same way.
    this.addSql(`revoke update, delete on "fleet_audit_logs" from public;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fleet_audit_logs";`);
  }
}
