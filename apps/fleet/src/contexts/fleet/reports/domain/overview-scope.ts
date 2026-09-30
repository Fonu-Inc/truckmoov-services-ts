import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { OWNER_OPERATOR_ORGANISATION_TYPE, Role } from "@shared/rbac";

/**
 * Who the overview is being built for. tenantId is the outer boundary; an owner
 * operator is additionally pinned to its own records, because an owner operator
 * can hold a seat inside somebody else's tenant and must not see the rest of it.
 * The exception is the owner of an owner-operator organisation, for whom the
 * role is the organisation's own owner and the whole fleet is theirs.
 */
export type OverviewScope = {
  tenantId: string;
  ownerOperatorId: string | null;
};

export const OVERVIEW_ROLES: readonly string[] = [
  Role.ENTERPRISE_ADMIN,
  Role.OWNER_OPERATOR,
];

type OverviewRequestUser = {
  userId?: string;
  role?: string;
  tenantId?: string;
  organizationType?: string | null;
};

export function resolveOverviewScope(user?: OverviewRequestUser): OverviewScope {
  const tenantId = user?.tenantId?.trim();
  if (!tenantId) {
    throw new UnauthorizedException("Tenant context is missing from the access token");
  }

  const role = user?.role?.trim();
  if (!role || !OVERVIEW_ROLES.includes(role)) {
    throw new ForbiddenException("This overview is available to enterprise admins and owner operators only");
  }

  if (role !== Role.OWNER_OPERATOR || user?.organizationType === OWNER_OPERATOR_ORGANISATION_TYPE) {
    return { tenantId, ownerOperatorId: null };
  }

  const ownerOperatorId = user?.userId?.trim();
  if (!ownerOperatorId) {
    throw new UnauthorizedException("Owner operator identity is missing from the access token");
  }
  return { tenantId, ownerOperatorId };
}

export function scopeMatchesOwnerOperator(
  scope: OverviewScope,
  ownerOperatorId: string | null | undefined,
): boolean {
  if (scope.ownerOperatorId === null) return true;
  return ownerOperatorId === scope.ownerOperatorId;
}
