import { Migration } from '@mikro-orm/migrations';

export class Migration20261004030000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "billing_arrears" add column if not exists "quantity" int null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "billing_arrears" drop column if exists "quantity";`);
  }
}
