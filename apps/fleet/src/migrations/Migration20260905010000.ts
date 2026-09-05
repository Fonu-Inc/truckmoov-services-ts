import { Migration } from '@mikro-orm/migrations';

export class Migration20260905010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "fleet_drivers" add column if not exists "performance_score" int null;`);
    this.addSql(`alter table "fleet_drivers" add column if not exists "performance_jobs_scored" int null;`);
    this.addSql(`alter table "fleet_drivers" add column if not exists "performance_scored_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "fleet_drivers" drop column if exists "performance_scored_at";`);
    this.addSql(`alter table "fleet_drivers" drop column if exists "performance_jobs_scored";`);
    this.addSql(`alter table "fleet_drivers" drop column if exists "performance_score";`);
  }
}
