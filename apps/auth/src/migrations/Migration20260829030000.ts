import { Migration } from "@mikro-orm/migrations";

export class Migration20260829030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "organisation_upgrade_requests" add column if not exists "target_plan_code" varchar(32) null`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "organisation_upgrade_requests" drop column if exists "target_plan_code"`);
  }
}
