import { Migration } from "@mikro-orm/migrations";

/**
 * What each communication channel costs, as an append-only history.
 *
 * Every wallet debit is computed from these, so a rate change must not reprice
 * anything already charged. Rows are never updated: a repricing appends a row
 * with a later effective_from, and a debit resolves the rate that was live when
 * it happened. Updating in place would silently rewrite past invoices.
 */
export class Migration20260825000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "communication_rates" (
        "id" varchar(255) not null primary key,
        "channel" varchar(32) not null,
        "unit" varchar(32) not null,
        "rate_kobo" bigint not null,
        "enabled" boolean not null default true,
        "description" varchar(255) not null default '',
        "effective_from" timestamptz not null default now(),
        "created_by" varchar(128) null,
        "created_at" timestamptz not null default now()
      );
    `);
    this.addSql(
      `create index if not exists "communication_rates_lookup_idx" on "communication_rates" ("channel", "effective_from" desc);`,
    );
    // One rate per channel per instant. Two rows sharing a timestamp would make
    // "the rate at that moment" ambiguous, and a debit could not be explained.
    this.addSql(
      `create unique index if not exists "communication_rates_effective_unique" on "communication_rates" ("channel", "effective_from");`,
    );
    this.addSql(`revoke update, delete on "communication_rates" from public;`);

    // Seeded from the rates the screen currently hardcodes, so nothing changes
    // price on the day this ships. IoT SIM is recurring monthly, not per
    // message: the panel labelled it per-message while describing it as per
    // active SIM per month, and only one of those can be implemented.
    this.addSql(`
      insert into "communication_rates"
        ("id", "channel", "unit", "rate_kobo", "enabled", "description", "effective_from")
      values
        ('rate-sms-seed', 'sms', 'per_message', 600, true, 'SMS rate per message', now()),
        ('rate-whatsapp-seed', 'whatsapp', 'per_message', 1000, true, 'WhatsApp rate per message', now()),
        ('rate-voice-seed', 'voice', 'per_minute', 2200, true, 'Voice call rate per minute', now()),
        ('rate-ai-seed', 'ai', 'per_message', 5000, true, 'AI optimisation rate per request', now()),
        ('rate-iot-sim-seed', 'iot_sim', 'recurring_monthly', 50000, true, 'IoT SIM connectivity rate per active SIM per month', now())
      on conflict ("id") do nothing;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "communication_rates";`);
  }
}
