/**
 * No granting what you don't have: whether a user may give someone a role,
 * which needs them to hold every permission it carries.
 */
export interface GrantCheck {
  mayGrantRole(actorUserId: string, role: string): Promise<boolean>;
}

export const GRANT_CHECK = Symbol("GRANT_CHECK");
