import { Migration } from '@mikro-orm/migrations';

export class Migration20261123230000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "installation_feedback" (
      "order_id" varchar(64) primary key,
      "rating" int not null check ("rating" between 1 and 5),
      "comment" varchar(1000) null,
      "submitted_at" timestamptz not null,
      "submitted_by" varchar(64) not null
    );`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "installation_feedback";`);
  }
}
