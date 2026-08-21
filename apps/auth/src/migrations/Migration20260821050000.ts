import { Migration } from '@mikro-orm/migrations';

export class Migration20260821050000 extends Migration {
  override async up(): Promise<void> {
    // One counter per series, per scope, per year. The primary key is what makes
    // a concurrent allocation safe: two callers contend on the same row, and
    // Postgres serialises them, so neither can read a value the other also read.
    this.addSql(`
      create table if not exists "invoice_number_sequences" (
        "series" varchar(64) not null,
        "scope" varchar(64) not null,
        "year" int not null,
        "next_value" bigint not null default 1,
        primary key ("series", "scope", "year")
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "invoice_number_sequences";`);
  }
}
