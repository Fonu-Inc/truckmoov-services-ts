import { Migration } from "@mikro-orm/migrations";

/**
 * Who the platform tells when something goes wrong, and how.
 *
 * One row per alert type. Screen 15 and screen 35 both configured this, keyed
 * differently — by severity on one, by event type on the other — with their own
 * recipient lists. Two lists drift: staff get removed from one and stay on the
 * other. This is the single store both read.
 */
export class Migration20260824060000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table if not exists "platform_alert_settings" (
        "alert_type" varchar(64) not null primary key,
        "enabled" boolean not null default true,
        "channels" jsonb not null default '[]'::jsonb,
        "recipients" jsonb not null default '[]'::jsonb,
        "min_severity" varchar(16) not null default 'high',
        "updated_at" timestamptz not null default now(),
        "updated_by" varchar(128) null
      );
    `);

    // Seeded so the screen has all four rows to render on first load, rather
    // than an empty table the operator has to populate before anything alerts.
    this.addSql(`
      insert into "platform_alert_settings" ("alert_type", "enabled", "channels", "recipients", "min_severity")
      values
        ('new_tenant_signup', true, '["email"]'::jsonb, '[]'::jsonb, 'low'),
        ('system_errors', true, '["email"]'::jsonb, '[]'::jsonb, 'high'),
        ('billing_alerts', true, '["email"]'::jsonb, '[]'::jsonb, 'high'),
        ('security_alerts', true, '["email"]'::jsonb, '[]'::jsonb, 'high')
      on conflict ("alert_type") do nothing;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "platform_alert_settings";`);
  }
}
