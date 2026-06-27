import { Migration } from "@mikro-orm/migrations";

export class Migration20260627000001 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`drop table if exists "fleet_jobs";`);
  }

  override async down(): Promise<void> {
    this.addSql(`
      create table if not exists "fleet_jobs" (
        "job_id" varchar(255) not null,
        "tenant_id" varchar(64) not null,
        "status" varchar(32) not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "fleet_jobs_pkey" primary key ("job_id")
      );
    `);
  }
}
