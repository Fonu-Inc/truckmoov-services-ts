import { Migration } from "@mikro-orm/migrations";

/**
 * Collapses the retired FLEET_ADMIN role into OWNER_OPERATOR.
 *
 * FLEET_ADMIN used role id 5. OWNER_OPERATOR already uses 3, so every user,
 * session and pending invite still holding 5 is moved before the role row is
 * removed. The onboarding record keeps the role it will give the first user
 * when the tenant is provisioned, so that string is rewritten too.
 *
 * Down is deliberately empty: inventing a new FLEET_ADMIN row on rollback
 * would not restore which users held it, and would resurrect a role the
 * application no longer knows.
 */
export class Migration20261120000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`update "auth_users" set "role_id" = 3 where "role_id" = 5;`);
    this.addSql(`update "auth_sessions" set "role_id" = 3 where "role_id" = 5;`);
    this.addSql(`update "auth_invites" set "role_id" = 3 where "role_id" = 5;`);

    this.addSql(
      `update "system_tenant_onboardings"
          set "bootstrap_role" = 'OWNER_OPERATOR'
        where "bootstrap_role" = 'FLEET_ADMIN';`,
    );

    this.addSql(`delete from "auth_roles" where "id" = 5;`);
  }

  override async down(): Promise<void> {
    // See the class comment: the old role's membership cannot be reconstructed.
  }
}
