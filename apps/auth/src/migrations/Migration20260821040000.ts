import { Migration } from '@mikro-orm/migrations';

export class Migration20260821040000 extends Migration {
  override async up(): Promise<void> {
    // Without a window start the month-to-date counter can never reset, so the
    // stored total would grow for ever against a monthly cap.
    this.addSql(
      `alter table "spending_limit_settings" add column if not exists "window_started_on" date null;`,
    );
    // Records which thresholds already fired inside the current window, so the
    // 80% notice is sent once rather than on every spend past the line.
    this.addSql(
      `alter table "spending_limit_settings" add column if not exists "notified_percentages" jsonb not null default '[]'::jsonb;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "spending_limit_settings" drop column if exists "notified_percentages";`,
    );
    this.addSql(
      `alter table "spending_limit_settings" drop column if exists "window_started_on";`,
    );
  }
}
