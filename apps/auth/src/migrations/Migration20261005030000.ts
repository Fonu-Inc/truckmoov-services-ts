import { Migration } from '@mikro-orm/migrations';

export class Migration20261005030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "sim_usage_daily" (
      "day" date not null,
      "total_usage_mb" numeric(16,2) not null default 0,
      "sims_count" int not null default 0,
      "captured_at" timestamptz not null default now(),
      constraint "sim_usage_daily_pkey" primary key ("day")
    );`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "sim_usage_daily";`);
  }
}
