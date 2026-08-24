import { Migration } from "@mikro-orm/migrations";
import { ROLE_IDS, Role } from "@shared/rbac";

const PLATFORM_ADMIN_ID = ROLE_IDS[Role.PLATFORM_ADMIN];
const FLEET_ADMIN_ID = ROLE_IDS[Role.FLEET_ADMIN];

/**
 * Moves fleet-provider organisations off the internal platform role.
 *
 * ORG_TYPE_TO_BOOTSTRAP_ROLE used to map fleet_provider to PLATFORM_ADMIN, the
 * internal Telconix/MTN system role. New tenants no longer do; the rows written
 * while that mapping was live still hold it.
 *
 * Scoped by joining system_tenant_onboardings: only a user whose own tenant is
 * a fleet provider is moved. A genuine internal platform administrator has no
 * onboarding row for their tenant and is left alone — that scoping is the whole
 * safety of this migration.
 *
 * Three tables hold the role. Fixing only auth_users would leave a pending
 * invite to hand out PLATFORM_ADMIN again the moment it is accepted.
 */
export class Migration20260824020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `update "auth_users" as u
          set "role_id" = ${FLEET_ADMIN_ID}
         from "system_tenant_onboardings" as o
        where o."tenant_id" = u."tenant_id"
          and o."organization_type" = 'fleet_provider'
          and u."role_id" = ${PLATFORM_ADMIN_ID};`,
    );

    // Only pending invites: an accepted one already produced its user row,
    // which the statement above has corrected.
    this.addSql(
      `update "auth_invites" as i
          set "role_id" = ${FLEET_ADMIN_ID}
         from "system_tenant_onboardings" as o
        where o."tenant_id" = i."tenant_id"
          and o."organization_type" = 'fleet_provider'
          and i."role_id" = ${PLATFORM_ADMIN_ID}
          and i."status" = 'pending';`,
    );

    this.addSql(
      `update "system_tenant_onboardings"
          set "bootstrap_role" = '${Role.FLEET_ADMIN}'
        where "organization_type" = 'fleet_provider'
          and "bootstrap_role" = '${Role.PLATFORM_ADMIN}';`,
    );
  }

  override async down(): Promise<void> {
    // Deliberately does nothing. Reversing this would hand the internal system
    // role back to customer organisations, and a rollback should not reinstate
    // a privilege escalation.
  }
}
