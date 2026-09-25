import { Migration } from '@mikro-orm/migrations';

/**
 * Installer settings: display and work preferences, and the notification
 * toggles renamed for the new screen. SMS is no longer sent to installers,
 * so smsAlerts goes; support ticket and in-platform toggles start on.
 */
export class Migration20260925160000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "installers"
      add column if not exists "display_preferences" jsonb null,
      add column if not exists "work_preferences" jsonb null;`);

    this.addSql(`update "installers" set "notification_preferences" = jsonb_strip_nulls(jsonb_build_object(
        'newInstallationOffers', "notification_preferences"->'newJobAssigned',
        'scheduleReminders', "notification_preferences"->'scheduleReminders',
        'jobAndIssueUpdates', "notification_preferences"->'jobStatusUpdates',
        'supportTicketUpdates', true,
        'emailAlerts', "notification_preferences"->'emailAlerts',
        'inPlatformAlerts', true
      )) where "notification_preferences" is not null;`);
  }

  /** smsAlerts comes back on, its default: the value it had is gone. */
  override async down(): Promise<void> {
    this.addSql(`update "installers" set "notification_preferences" = jsonb_strip_nulls(jsonb_build_object(
        'newJobAssigned', "notification_preferences"->'newInstallationOffers',
        'scheduleReminders', "notification_preferences"->'scheduleReminders',
        'jobStatusUpdates', "notification_preferences"->'jobAndIssueUpdates',
        'smsAlerts', true,
        'emailAlerts', "notification_preferences"->'emailAlerts'
      )) where "notification_preferences" is not null;`);

    this.addSql(`alter table "installers"
      drop column if exists "work_preferences",
      drop column if exists "display_preferences";`);
  }
}
