import { Migration } from '@mikro-orm/migrations';

export class Migration20261006020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "tenant_trials" (
      "tenant_id" varchar(64) not null,
      "started_at" timestamptz not null default now(),
      "trial_ends_at" timestamptz not null,
      "extended_count" int not null default 0,
      "converted_at" timestamptz null,
      "converted_plan_code" varchar(128) null,
      "updated_by" varchar(64) null,
      "updated_at" timestamptz not null default now(),
      constraint "tenant_trials_pkey" primary key ("tenant_id")
    );`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "tenant_trials";`);
  }
}
