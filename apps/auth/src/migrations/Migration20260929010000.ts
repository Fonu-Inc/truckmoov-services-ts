import { Migration } from '@mikro-orm/migrations';

/**
 * A vehicle licence is filed once per vehicle, but the original unique index
 * allowed one document of each type per application, so a second vehicle's
 * licence failed with a duplicate key. One row per type for application-wide
 * documents, one per type and vehicle for the rest.
 */
export class Migration20260929010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`drop index if exists "onboarding_application_documents_type_unique";`);
    this.addSql(`create unique index if not exists "onboarding_application_documents_type_unique"
      on "onboarding_application_documents" ("application_id", "document_type")
      where "vehicle_id" is null;`);
    this.addSql(`create unique index if not exists "onboarding_application_documents_vehicle_type_unique"
      on "onboarding_application_documents" ("application_id", "document_type", "vehicle_id")
      where "vehicle_id" is not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "onboarding_application_documents_vehicle_type_unique";`);
    this.addSql(`drop index if exists "onboarding_application_documents_type_unique";`);
    this.addSql(`create unique index if not exists "onboarding_application_documents_type_unique"
      on "onboarding_application_documents" ("application_id", "document_type");`);
  }
}
