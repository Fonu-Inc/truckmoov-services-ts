import { Migration } from '@mikro-orm/migrations';

export class Migration20261123200000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "onboarding_applications" add column if not exists "telecom_master_number_type" varchar(16) null, add column if not exists "telecom_master_msisdn" varchar(32) null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "onboarding_applications" drop column if exists "telecom_master_number_type", drop column if exists "telecom_master_msisdn";`,
    );
  }
}
