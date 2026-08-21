import { Migration } from "@mikro-orm/migrations";

export class Migration20260821020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "fleet_compliance_documents" add column if not exists "superseded_at" timestamptz null;`,
    );
    this.addSql(
      `alter table "fleet_compliance_documents" add column if not exists "superseded_by_id" varchar(255) null;`,
    );
    // Every list and sweep filters superseded rows out, so the tenant lookup
    // carries the column.
    this.addSql(
      `create index if not exists "fleet_compliance_documents_active_idx" on "fleet_compliance_documents" ("tenant_id", "superseded_at");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "fleet_compliance_documents_active_idx";`);
    this.addSql(
      `alter table "fleet_compliance_documents" drop column if exists "superseded_by_id";`,
    );
    this.addSql(
      `alter table "fleet_compliance_documents" drop column if exists "superseded_at";`,
    );
  }
}
