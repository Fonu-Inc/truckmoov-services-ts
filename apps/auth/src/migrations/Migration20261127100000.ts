import { Migration } from '@mikro-orm/migrations';

export class Migration20261127100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "onboarding_device_allocations" (
      "application_id" varchar(64) primary key,
      "tenant_id" varchar(64) not null,
      "requested" int not null,
      "owed" int not null,
      "alerted_owed" int null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now()
    );`);
    this.addSql(`create index if not exists "onboarding_device_allocations_owed_index" on "onboarding_device_allocations" ("created_at") where "owed" > 0;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "onboarding_device_allocations";`);
  }
}
