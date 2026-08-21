import { Migration } from "@mikro-orm/migrations";

export class Migration20260821010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "fleet_compliance_documents" add column if not exists "reminder_sent_at" timestamptz null;`,
    );
    // The sweep looks for documents inside the window that have not been
    // reminded yet, so it reads both columns together.
    this.addSql(
      `create index if not exists "fleet_compliance_documents_reminder_idx" on "fleet_compliance_documents" ("expiry_date", "reminder_sent_at");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "fleet_compliance_documents_reminder_idx";`);
    this.addSql(
      `alter table "fleet_compliance_documents" drop column if exists "reminder_sent_at";`,
    );
  }
}
