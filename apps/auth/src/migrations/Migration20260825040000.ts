import { Migration } from "@mikro-orm/migrations";

/**
 * Installer guide content on the device catalogue.
 *
 * The person fitting a tracker needs the SMS commands that point it at our
 * ingest, the wiring notes for that model, and the diagram. All three vary by
 * model and none of them are tenant data, so the catalogue is where they live.
 */
export class Migration20260825040000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "system_device_models"
        add column if not exists "sms_commands" jsonb not null default '[]',
        add column if not exists "wiring_notes" text null,
        add column if not exists "diagram_urls" jsonb not null default '[]'
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      alter table "system_device_models"
        drop column if exists "sms_commands",
        drop column if exists "wiring_notes",
        drop column if exists "diagram_urls"
    `);
  }
}
