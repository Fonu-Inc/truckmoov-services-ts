import { Migration } from '@mikro-orm/migrations';

export class Migration20260821000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "tenant_kyc_documents" add column if not exists "reviewed_by" varchar(64) null;`,
    );
    this.addSql(
      `alter table "tenant_kyc_documents" add column if not exists "reviewed_at" timestamptz null;`,
    );
    this.addSql(
      `alter table "tenant_kyc_documents" add column if not exists "rejection_reason" varchar(1000) null;`,
    );
    this.addSql(
      `create index if not exists "tenant_kyc_documents_status_idx" on "tenant_kyc_documents" (status);`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "tenant_kyc_documents_status_idx";`);
    this.addSql(
      `alter table "tenant_kyc_documents" drop column if exists "rejection_reason";`,
    );
    this.addSql(
      `alter table "tenant_kyc_documents" drop column if exists "reviewed_at";`,
    );
    this.addSql(
      `alter table "tenant_kyc_documents" drop column if exists "reviewed_by";`,
    );
  }
}
