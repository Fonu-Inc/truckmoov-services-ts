import { Migration } from '@mikro-orm/migrations';

export class Migration20261123210000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "onboarding_applications" add column if not exists "previous_token_hash" varchar(128) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "onboarding_applications" drop column if exists "previous_token_hash";`);
  }
}
