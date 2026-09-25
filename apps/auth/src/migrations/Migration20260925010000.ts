import { Migration } from '@mikro-orm/migrations';

export class Migration20260925010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`update "installation_orders" set "status" = 'scheduled' where "status" = 'accepted';`);
    this.addSql(`update "installation_orders" set "pre_exception_status" = 'scheduled' where "pre_exception_status" = 'accepted';`);

    this.addSql(`create table if not exists "installation_offer_rejections" (
      "order_id" varchar(64) not null,
      "installer_id" varchar(64) not null,
      "reason" varchar(500) not null,
      "rejected_at" timestamptz not null default now(),
      constraint "installation_offer_rejections_pkey" primary key ("order_id", "installer_id")
    );`);
  }

  /** Jobs moved from accepted cannot be told from those scheduled already, so they stay scheduled. */
  override async down(): Promise<void> {
    this.addSql(`drop table if exists "installation_offer_rejections";`);
  }
}
