export { accessProviders, type AccessOptions } from "./access.module";
export { HideForbiddenInterceptor } from "./hide-forbidden.interceptor";
export { PortalGuard } from "./portal.guard";
export {
  CALLER_AUDIENCE,
  PORTALS_KEY,
  PORTAL_ENFORCEMENT,
  Portals,
  REFUSAL_REPORTER,
  clientIp,
  routeNotFound,
  type Audience,
  type Caller,
  type CallerAudienceResolver,
  type Refusal,
  type RefusalReporter,
  type RequestLike,
} from "./portals";
export { VerifiedCallerAudience } from "./verified-caller-audience";
export {
  PERMISSION_CATALOG,
  isPermission,
  permissionsOf,
  portalOfPermission,
  type PermissionEntry,
  type PermissionKey,
  type PermissionPortal,
} from "./catalog";
export { PREDEFINED_ROLES, predefinedRole, type PredefinedRole } from "./predefined-roles";
export { ACCESS_CHANGED_SUBJECT, AccessClient, type RemoteAccess } from "./access-client";
