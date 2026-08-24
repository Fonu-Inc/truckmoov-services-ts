import { describe, expect, it } from 'vitest';
import { ROLE_IDS, Role } from '@shared/rbac';
import { Migration20260824020000 } from '../../../apps/auth/src/migrations/Migration20260824020000';

function queriesOf(): string[] {
  const migration = new Migration20260824020000(null as never, null as never);
  migration.up();
  return migration.getQueries().map((query) => String(query));
}

describe('fleet provider demotion migration', () => {
  it('scopes every write to fleet-provider organisations', () => {
    for (const query of queriesOf()) {
      expect(query).toContain("'fleet_provider'");
    }
  });

  it('joins the onboarding table, so an internal platform admin is untouched', () => {
    const rowWrites = queriesOf().filter((query) => query.includes('auth_users') || query.includes('auth_invites'));

    expect(rowWrites).toHaveLength(2);
    for (const query of rowWrites) {
      expect(query).toContain('system_tenant_onboardings');
    }
  });

  it('only rewrites rows that currently hold the platform role', () => {
    for (const query of queriesOf()) {
      expect(query).toMatch(new RegExp(`= ${ROLE_IDS[Role.PLATFORM_ADMIN]}|'${Role.PLATFORM_ADMIN}'`));
    }
  });

  it('writes the fleet admin role, not some other id', () => {
    const idWrites = queriesOf().filter((query) => query.includes('role_id'));

    for (const query of idWrites) {
      expect(query).toContain(`set "role_id" = ${ROLE_IDS[Role.FLEET_ADMIN]}`);
    }
  });

  it('leaves accepted invites alone, since their user row is already corrected', () => {
    const inviteWrite = queriesOf().find((query) => query.includes('auth_invites'));

    expect(inviteWrite).toContain("\"status\" = 'pending'");
  });

  it('covers all three tables that hold a role', () => {
    const queries = queriesOf().join('\n');

    expect(queries).toContain('auth_users');
    expect(queries).toContain('auth_invites');
    expect(queries).toContain('system_tenant_onboardings');
  });

  it('does not reinstate the escalation on rollback', () => {
    const migration = new Migration20260824020000(null as never, null as never);
    migration.down();

    expect(migration.getQueries()).toHaveLength(0);
  });
});
