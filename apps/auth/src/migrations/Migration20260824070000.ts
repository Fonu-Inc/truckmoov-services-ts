import { Migration } from "@mikro-orm/migrations";

/**
 * One subscription plan per tier.
 *
 * The rule holds today only because the seed service happens to key its ids by
 * tier. Nothing enforces it, so the first plan-creation endpoint could store a
 * second Enterprise plan and the onboarding screens would show both.
 */
export class Migration20260824070000 extends Migration {
  override async up(): Promise<void> {
    // Duplicates are removed before the constraint is added, keeping the oldest
    // of each tier. A migration that fails on existing data blocks the deploy.
    this.addSql(`
      delete from "system_subscription_plans" as p
       using "system_subscription_plans" as older
       where p."tier" = older."tier"
         and (older."created_at", older."id") < (p."created_at", p."id");
    `);
    this.addSql(
      `create unique index if not exists "system_subscription_plans_tier_unique" on "system_subscription_plans" ("tier");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "system_subscription_plans_tier_unique";`);
  }
}
