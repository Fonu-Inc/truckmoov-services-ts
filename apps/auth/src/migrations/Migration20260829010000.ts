import { Migration } from "@mikro-orm/migrations";

/**
 * The "Log a Ticket" form's Channel dropdown (device/sim/vehicle/messaging/
 * billing/other), separate from context_type which references a specific
 * record rather than categorizing the ticket's topic.
 */
export class Migration20260829010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      alter table "support_tickets"
        add column if not exists "channel" varchar(16) null,
        add column if not exists "other_channel" varchar(255) null;
    `);
  }
}
