import { Migration } from '@mikro-orm/migrations';

export class Migration20260406183000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table "auth_users" add column if not exists "account_status" varchar(20) not null default 'enabled';`);
    this.addSql(`update "auth_users" set "account_status" = 'enabled' where "account_status" is null or "account_status" = '';`);
  }

}
